// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IInterestRateModel} from "./interfaces/IInterestRateModel.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {DataTypes} from "./libraries/DataTypes.sol";
import {Errors} from "./libraries/Errors.sol";
import {Events} from "./libraries/Events.sol";

/**
 * @title ArcLendVault
 * @notice Core lending vault for the ArcLend protocol on Arc Network.
 *
 * Architecture: Auto-collateralized lending (Compound/Aave-style).
 * - Supplied assets automatically serve as collateral.
 * - No separate collateral deposit required.
 * - Cross-asset borrowing: Supply USDC → Borrow EURC (and vice versa).
 * - Health factor derived from total supplied value vs total debt value.
 *
 * @dev Share-based accounting for supply positions.
 *      Debt tracking via per-asset borrow index that compounds per-block interest.
 *      All assets assumed to be stablecoins at ~$1 (USDC, EURC) for MVP.
 */
contract ArcLendVault {
    // ============ Constants ============

    /// @dev Ray unit: 1e27 represents 100% (1.0)
    uint256 public constant RAY = 1e27;

    // ============ State Variables ============

    /// @notice The protocol administrator address
    address public admin;

    /// @notice The interest rate model contract
    IInterestRateModel public interestRateModel;

    /// @notice The price oracle contract
    IPriceOracle public priceOracle;

    /// @notice Collateral factor (LTV) in ray. E.g., 0.80e27 = 80%
    /// @dev For MVP, this serves as both the borrow LTV and liquidation threshold.
    ///      In production, these should be separate (LTV < liquidationThreshold).
    uint256 public collateralFactor;

    /// @notice Liquidation incentive in ray. E.g., 0.05e27 = 5%
    uint256 public liquidationIncentive;

    /// @notice Mapping of supported lending assets (USDC, EURC)
    mapping(address => bool) public supportedAssets;

    /// @notice Array of supported asset addresses for iteration
    address[] public supportedAssetsList;

    /// @notice Per-asset pool state
    mapping(address => DataTypes.PoolState) internal _poolStates;

    /// @notice User share balances per asset: user => asset => shares
    mapping(address => mapping(address => uint256)) public userShares;

    /// @notice User borrow principals per asset: user => asset => principal
    mapping(address => mapping(address => uint256)) public userBorrowPrincipal;

    /// @notice User borrow index snapshots per asset: user => asset => index
    mapping(address => mapping(address => uint256)) public userBorrowIndex;

    /// @notice Protocol bad debt per asset
    mapping(address => uint256) public badDebt;

    // ============ Modifiers ============

    modifier onlyAdmin() {
        if (msg.sender != admin) revert Errors.Unauthorized();
        _;
    }

    // ============ Constructor ============

    /**
     * @notice Initializes the ArcLendVault.
     * @param _admin The administrator address.
     * @param _interestRateModel The interest rate model contract.
     * @param _priceOracle The price oracle contract.
     * @param _supportedAssets Array of supported asset addresses (USDC, EURC).
     * @param _collateralFactor LTV ratio in ray (e.g., 0.80e27 = 80%).
     * @param _liquidationIncentive Liquidation bonus in ray (e.g., 0.05e27 = 5%).
     */
    constructor(
        address _admin,
        address _interestRateModel,
        address _priceOracle,
        address[] memory _supportedAssets,
        uint256 _collateralFactor,
        uint256 _liquidationIncentive
    ) {
        if (_admin == address(0)) revert Errors.InvalidParameter();
        if (_interestRateModel == address(0)) revert Errors.InvalidParameter();
        if (_priceOracle == address(0)) revert Errors.InvalidParameter();

        admin = _admin;
        interestRateModel = IInterestRateModel(_interestRateModel);
        priceOracle = IPriceOracle(_priceOracle);
        collateralFactor = _collateralFactor;
        liquidationIncentive = _liquidationIncentive;

        for (uint256 i = 0; i < _supportedAssets.length; i++) {
            if (_supportedAssets[i] == address(0)) revert Errors.InvalidParameter();
            supportedAssets[_supportedAssets[i]] = true;
            supportedAssetsList.push(_supportedAssets[i]);

            _poolStates[_supportedAssets[i]].borrowIndex = RAY;
            _poolStates[_supportedAssets[i]].lastAccrualBlock = block.number;
        }
    }

    // ============ Deposit ============

    /**
     * @notice Deposit assets into the lending pool.
     *         Supplied assets automatically count as collateral.
     * @param asset The ERC-20 token to deposit.
     * @param amount The amount to deposit.
     * @return shares The share tokens minted.
     */
    function deposit(address asset, uint256 amount) external returns (uint256 shares) {
        if (amount == 0) revert Errors.InvalidAmount();
        if (!supportedAssets[asset]) revert Errors.UnsupportedAsset();

        DataTypes.PoolState storage pool = _poolStates[asset];
        if (pool.depositsPaused) revert Errors.DepositsPaused();

        // Transfer tokens from user
        _safeTransferFrom(asset, msg.sender, address(this), amount);

        // Calculate shares
        if (pool.totalShares == 0 || pool.totalDeposits == 0) {
            shares = amount;
        } else {
            shares = (amount * pool.totalShares) / pool.totalDeposits;
        }

        // Update state
        pool.totalShares += shares;
        pool.totalDeposits += amount;
        userShares[msg.sender][asset] += shares;

        emit Events.Deposit(msg.sender, asset, amount, shares);
    }

    // ============ Withdraw ============

    /**
     * @notice Withdraw assets by burning share tokens.
     *         Validates health factor remains >= 1.0 if user has borrows.
     * @param asset The ERC-20 token to withdraw.
     * @param shares The share tokens to burn.
     * @return amount The underlying tokens returned.
     */
    function withdraw(address asset, uint256 shares) external returns (uint256 amount) {
        if (shares == 0) revert Errors.InvalidAmount();
        if (userShares[msg.sender][asset] < shares) revert Errors.InsufficientShares();

        DataTypes.PoolState storage pool = _poolStates[asset];
        if (pool.withdrawalsPaused) revert Errors.WithdrawalsPaused();

        _accrueInterest(asset);

        // Calculate underlying amount
        amount = (shares * pool.totalDeposits) / pool.totalShares;

        // Check liquidity
        uint256 availableLiquidity = pool.totalDeposits - pool.totalBorrows;
        if (availableLiquidity < amount) revert Errors.LiquidityUnavailable();

        // If user has borrows, validate HF after withdrawal
        if (_userHasBorrows(msg.sender)) {
            // Simulate withdrawal
            userShares[msg.sender][asset] -= shares;
            pool.totalShares -= shares;
            pool.totalDeposits -= amount;

            uint256 hf = _calculateHealthFactor(msg.sender);

            // Restore
            userShares[msg.sender][asset] += shares;
            pool.totalShares += shares;
            pool.totalDeposits += amount;

            if (hf < RAY) revert Errors.Undercollateralized();
        }

        // Apply withdrawal
        userShares[msg.sender][asset] -= shares;
        pool.totalShares -= shares;
        pool.totalDeposits -= amount;

        _safeTransfer(asset, msg.sender, amount);

        emit Events.Withdrawal(msg.sender, asset, shares, amount);
    }

    // ============ Borrow ============

    /**
     * @notice Borrow assets against supplied collateral.
     *         Collateral = total value of all supplied positions.
     *         Cross-asset borrowing supported (supply USDC, borrow EURC).
     * @param asset The ERC-20 token to borrow.
     * @param amount The amount to borrow.
     */
    function borrow(address asset, uint256 amount) external {
        if (amount == 0) revert Errors.InvalidAmount();
        if (!supportedAssets[asset]) revert Errors.UnsupportedAsset();

        DataTypes.PoolState storage pool = _poolStates[asset];
        if (pool.borrowsPaused) revert Errors.BorrowsPaused();

        _accrueInterest(asset);

        // Check liquidity
        uint256 availableLiquidity = pool.totalDeposits - pool.totalBorrows;
        if (availableLiquidity < amount) revert Errors.LiquidityUnavailable();

        // Record borrow
        uint256 existingPrincipal = userBorrowPrincipal[msg.sender][asset];
        uint256 existingIndex = userBorrowIndex[msg.sender][asset];

        uint256 newPrincipal;
        if (existingPrincipal > 0 && existingIndex > 0) {
            uint256 currentDebt = (existingPrincipal * pool.borrowIndex) / existingIndex;
            newPrincipal = currentDebt + amount;
        } else {
            newPrincipal = amount;
        }

        // Temporarily set state to check HF
        userBorrowPrincipal[msg.sender][asset] = newPrincipal;
        userBorrowIndex[msg.sender][asset] = pool.borrowIndex;
        pool.totalBorrows += amount;

        // Validate HF >= 1.0
        uint256 hf = _calculateHealthFactor(msg.sender);
        if (hf < RAY) {
            // Restore and revert
            userBorrowPrincipal[msg.sender][asset] = existingPrincipal;
            userBorrowIndex[msg.sender][asset] = existingIndex;
            pool.totalBorrows -= amount;
            revert Errors.Undercollateralized();
        }

        // Transfer tokens to borrower
        _safeTransfer(asset, msg.sender, amount);

        emit Events.Borrow(msg.sender, asset, amount);
    }

    // ============ Repay ============

    /**
     * @notice Repay borrowed assets.
     * @param asset The ERC-20 token to repay.
     * @param amount The amount to repay (capped at outstanding debt).
     * @return actualRepaid The actual amount applied to debt.
     */
    function repay(address asset, uint256 amount) external returns (uint256 actualRepaid) {
        if (amount == 0) revert Errors.InvalidAmount();
        if (!supportedAssets[asset]) revert Errors.UnsupportedAsset();

        DataTypes.PoolState storage pool = _poolStates[asset];
        if (pool.repaymentsPaused) revert Errors.RepaymentsPaused();

        uint256 principal = userBorrowPrincipal[msg.sender][asset];
        if (principal == 0) revert Errors.NoActiveDebt();

        _accrueInterest(asset);

        // Calculate outstanding debt
        uint256 userIdx = userBorrowIndex[msg.sender][asset];
        uint256 outstandingDebt = (principal * pool.borrowIndex) / userIdx;

        // Cap at outstanding debt
        actualRepaid = amount < outstandingDebt ? amount : outstandingDebt;

        // Transfer from user
        _safeTransferFrom(asset, msg.sender, address(this), actualRepaid);

        // Update borrow state
        if (actualRepaid >= outstandingDebt) {
            userBorrowPrincipal[msg.sender][asset] = 0;
            userBorrowIndex[msg.sender][asset] = 0;
        } else {
            uint256 remainingDebt = outstandingDebt - actualRepaid;
            userBorrowPrincipal[msg.sender][asset] = remainingDebt;
            userBorrowIndex[msg.sender][asset] = pool.borrowIndex;
        }

        // Update pool
        pool.totalBorrows = pool.totalBorrows > actualRepaid
            ? pool.totalBorrows - actualRepaid
            : 0;

        emit Events.Repay(msg.sender, asset, actualRepaid);
    }

    // ============ Liquidation ============

    /**
     * @notice Liquidate an undercollateralized position.
     *         Seizes supplied shares from the borrower as collateral.
     * @param borrower The undercollateralized borrower.
     * @param debtAsset The debt asset to repay.
     * @param repayAmount The amount of debt to repay.
     * @return collateralSeized The USD value of shares seized.
     */
    function liquidate(
        address borrower,
        address debtAsset,
        uint256 repayAmount
    ) external returns (uint256 collateralSeized) {
        if (repayAmount == 0) revert Errors.InvalidAmount();

        _accrueInterest(debtAsset);

        // Validate borrower is undercollateralized
        if (_calculateHealthFactor(borrower) >= RAY) revert Errors.PositionHealthy();

        // Calculate outstanding debt and cap at 50%
        uint256 principal = userBorrowPrincipal[borrower][debtAsset];
        uint256 userIdx = userBorrowIndex[borrower][debtAsset];
        DataTypes.PoolState storage pool = _poolStates[debtAsset];
        uint256 outstandingDebt = (principal * pool.borrowIndex) / userIdx;
        uint256 maxRepay = outstandingDebt / 2;
        uint256 actualRepay = repayAmount < maxRepay ? repayAmount : maxRepay;

        // Calculate collateral value to seize (in 6-decimal USD terms)
        // seizeValue = actualRepay * (1 + liquidationIncentive)
        uint256 seizeValue = (actualRepay * (RAY + liquidationIncentive)) / RAY;
        collateralSeized = seizeValue;

        // Seize shares from borrower's largest supply position
        _seizeShares(borrower, msg.sender, seizeValue);

        // Transfer debt tokens from liquidator
        _safeTransferFrom(debtAsset, msg.sender, address(this), actualRepay);

        // Reduce borrower's debt
        if (actualRepay >= outstandingDebt) {
            userBorrowPrincipal[borrower][debtAsset] = 0;
            userBorrowIndex[borrower][debtAsset] = 0;
        } else {
            uint256 remainingDebt = outstandingDebt - actualRepay;
            userBorrowPrincipal[borrower][debtAsset] = remainingDebt;
            userBorrowIndex[borrower][debtAsset] = pool.borrowIndex;
        }

        pool.totalBorrows = pool.totalBorrows > actualRepay
            ? pool.totalBorrows - actualRepay
            : 0;

        emit Events.Liquidation(msg.sender, borrower, actualRepay, collateralSeized);
    }

    // ============ Admin Functions ============

    function setCollateralFactor(uint256 newFactor) external onlyAdmin {
        if (newFactor < 0.01e27 || newFactor > 0.97e27) revert Errors.InvalidParameter();
        uint256 old = collateralFactor;
        collateralFactor = newFactor;
        emit Events.ParameterUpdated("collateralFactor", old, newFactor);
    }

    function setLiquidationIncentive(uint256 newIncentive) external onlyAdmin {
        if (newIncentive < 0.01e27 || newIncentive > 0.15e27) revert Errors.InvalidParameter();
        uint256 old = liquidationIncentive;
        liquidationIncentive = newIncentive;
        emit Events.ParameterUpdated("liquidationIncentive", old, newIncentive);
    }

    function setRateModelParams(
        uint256 _baseRate,
        uint256 _baseSlope,
        uint256 _jumpSlope,
        uint256 _kink,
        uint256 _reserveFactor
    ) external onlyAdmin {
        interestRateModel.setBaseRate(_baseRate);
        interestRateModel.setBaseSlope(_baseSlope);
        interestRateModel.setJumpSlope(_jumpSlope);
        interestRateModel.setKink(_kink);
        interestRateModel.setReserveFactor(_reserveFactor);
    }

    function pauseDeposits(bool paused) external onlyAdmin {
        for (uint256 i = 0; i < supportedAssetsList.length; i++) {
            _poolStates[supportedAssetsList[i]].depositsPaused = paused;
        }
        emit Events.PauseStatusUpdated("deposit", paused);
    }

    function pauseWithdrawals(bool paused) external onlyAdmin {
        for (uint256 i = 0; i < supportedAssetsList.length; i++) {
            _poolStates[supportedAssetsList[i]].withdrawalsPaused = paused;
        }
        emit Events.PauseStatusUpdated("withdraw", paused);
    }

    function pauseBorrows(bool paused) external onlyAdmin {
        for (uint256 i = 0; i < supportedAssetsList.length; i++) {
            _poolStates[supportedAssetsList[i]].borrowsPaused = paused;
        }
        emit Events.PauseStatusUpdated("borrow", paused);
    }

    function pauseRepayments(bool paused) external onlyAdmin {
        for (uint256 i = 0; i < supportedAssetsList.length; i++) {
            _poolStates[supportedAssetsList[i]].repaymentsPaused = paused;
        }
        emit Events.PauseStatusUpdated("repay", paused);
    }

    // ============ View Functions ============

    function getPoolState(address asset) external view returns (DataTypes.PoolState memory) {
        return _poolStates[asset];
    }

    function getHealthFactor(address user) external view returns (uint256) {
        return _calculateHealthFactor(user);
    }

    /**
     * @notice Get user position for the first supported asset.
     * @dev For the MVP, returns supply shares and borrow data for the primary asset.
     *      shareBalance = supply shares (auto-collateral)
     *      collateralBalance = total supply value across all assets (6 decimals)
     *      borrowPrincipal = borrow principal for primary asset
     *      borrowIndex = borrow index for primary asset
     */
    function getUserPosition(address user) external view returns (DataTypes.UserPosition memory) {
        DataTypes.UserPosition memory position;

        if (supportedAssetsList.length > 0) {
            address asset = supportedAssetsList[0];
            position.shareBalance = userShares[user][asset];
            position.borrowPrincipal = userBorrowPrincipal[user][asset];
            position.borrowIndex = userBorrowIndex[user][asset];
        }

        // collateralBalance = total supply value (sum of all supplied positions in 6 decimals)
        position.collateralBalance = _getTotalSupplyValue(user);

        return position;
    }

    /**
     * @notice Get the total borrow power for a user.
     * @return borrowPower in 6-decimal USD terms.
     */
    function getBorrowPower(address user) external view returns (uint256) {
        uint256 totalSupplyValue = _getTotalSupplyValue(user);
        return (totalSupplyValue * collateralFactor) / RAY;
    }

    /**
     * @notice Get the total outstanding debt for a user across all assets.
     * @return totalDebt in 6-decimal USD terms.
     */
    function getTotalDebt(address user) external view returns (uint256) {
        return _getTotalDebt(user);
    }

    // ============ Internal Functions ============

    /**
     * @dev Calculates health factor based on supplied positions as collateral.
     *      HF = (totalSupplyValue * collateralFactor) / totalDebt
     *      Returns type(uint256).max if no debt.
     */
    function _calculateHealthFactor(address user) internal view returns (uint256) {
        uint256 totalDebt = _getTotalDebt(user);
        if (totalDebt == 0) return type(uint256).max;

        uint256 totalSupplyValue = _getTotalSupplyValue(user);
        if (totalSupplyValue == 0) return 0;

        // HF = (supplyValue * collateralFactor) / totalDebt
        // supplyValue and totalDebt are both in 6-decimal token units
        // collateralFactor is in ray (1e27)
        // Result is in ray: HF of 1.0 = 1e27
        return (totalSupplyValue * collateralFactor) / totalDebt;
    }

    /**
     * @dev Gets total supply value for a user across all assets (6 decimals).
     *      For stablecoins (USDC, EURC), 1 token = $1, so value = amount.
     */
    function _getTotalSupplyValue(address user) internal view returns (uint256) {
        uint256 totalValue = 0;
        for (uint256 i = 0; i < supportedAssetsList.length; i++) {
            address asset = supportedAssetsList[i];
            uint256 shares = userShares[user][asset];
            if (shares > 0) {
                DataTypes.PoolState storage pool = _poolStates[asset];
                if (pool.totalShares > 0) {
                    uint256 underlyingAmount = (shares * pool.totalDeposits) / pool.totalShares;
                    totalValue += underlyingAmount;
                }
            }
        }
        return totalValue;
    }

    /**
     * @dev Gets total debt for a user across all assets (6 decimals).
     */
    function _getTotalDebt(address user) internal view returns (uint256) {
        uint256 totalDebt = 0;
        for (uint256 i = 0; i < supportedAssetsList.length; i++) {
            address asset = supportedAssetsList[i];
            uint256 principal = userBorrowPrincipal[user][asset];
            if (principal > 0) {
                DataTypes.PoolState storage pool = _poolStates[asset];
                uint256 userIdx = userBorrowIndex[user][asset];
                if (userIdx > 0) {
                    totalDebt += (principal * pool.borrowIndex) / userIdx;
                }
            }
        }
        return totalDebt;
    }

    /**
     * @dev Checks if a user has any active borrows.
     */
    function _userHasBorrows(address user) internal view returns (bool) {
        for (uint256 i = 0; i < supportedAssetsList.length; i++) {
            if (userBorrowPrincipal[user][supportedAssetsList[i]] > 0) return true;
        }
        return false;
    }

    /**
     * @dev Seizes supply shares from borrower and transfers to liquidator.
     *      Seizes from the borrower's largest position first.
     * @param borrower The borrower whose shares are seized.
     * @param liquidator The liquidator receiving the shares.
     * @param seizeValue The USD value to seize (6 decimals).
     */
    function _seizeShares(address borrower, address liquidator, uint256 seizeValue) internal {
        uint256 remaining = seizeValue;

        for (uint256 i = 0; i < supportedAssetsList.length && remaining > 0; i++) {
            address asset = supportedAssetsList[i];
            uint256 borrowerShares = userShares[borrower][asset];
            if (borrowerShares == 0) continue;

            DataTypes.PoolState storage pool = _poolStates[asset];
            if (pool.totalShares == 0) continue;

            uint256 borrowerValue = (borrowerShares * pool.totalDeposits) / pool.totalShares;
            uint256 seizeFromThis = remaining < borrowerValue ? remaining : borrowerValue;
            uint256 sharesToSeize = (seizeFromThis * pool.totalShares) / pool.totalDeposits;

            if (sharesToSeize > borrowerShares) sharesToSeize = borrowerShares;

            userShares[borrower][asset] -= sharesToSeize;
            userShares[liquidator][asset] += sharesToSeize;

            remaining -= seizeFromThis;
        }

        // If remaining > 0, record as bad debt (insufficient collateral)
        if (remaining > 0 && supportedAssetsList.length > 0) {
            badDebt[supportedAssetsList[0]] += remaining;
        }
    }

    /**
     * @dev Accrues interest for a given asset pool.
     */
    function _accrueInterest(address asset) internal {
        DataTypes.PoolState storage pool = _poolStates[asset];

        uint256 blocksElapsed = block.number - pool.lastAccrualBlock;
        if (blocksElapsed == 0) return;

        if (pool.totalBorrows == 0) {
            pool.lastAccrualBlock = block.number;
            return;
        }

        uint256 totalSupplyForUtil = pool.totalDeposits > pool.totalReserves
            ? pool.totalDeposits - pool.totalReserves
            : 0;
        uint256 utilization = interestRateModel.getUtilization(pool.totalBorrows, totalSupplyForUtil);
        uint256 borrowRateAnnual = interestRateModel.getBorrowRate(utilization);

        // ~2 second blocks on Arc Network
        uint256 blocksPerYear = 15_768_000;
        uint256 borrowRatePerBlock = borrowRateAnnual / blocksPerYear;
        uint256 simpleInterestFactor = borrowRatePerBlock * blocksElapsed;

        uint256 interestAccrued = (pool.totalBorrows * simpleInterestFactor) / RAY;

        pool.borrowIndex = (pool.borrowIndex * (RAY + simpleInterestFactor)) / RAY;
        pool.totalBorrows += interestAccrued;

        uint256 reserveFactorRay = _getReserveFactor();
        uint256 reserveIncrease = (interestAccrued * reserveFactorRay) / RAY;
        pool.totalReserves += reserveIncrease;
        pool.totalDeposits += (interestAccrued - reserveIncrease);

        pool.lastAccrualBlock = block.number;
    }

    function _getReserveFactor() internal view returns (uint256) {
        (bool success, bytes memory data) = address(interestRateModel).staticcall(
            abi.encodeWithSignature("reserveFactor()")
        );
        if (success && data.length >= 32) {
            return abi.decode(data, (uint256));
        }
        return 0;
    }

    // ============ Safe Transfer Helpers ============

    function _safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", from, to, amount)
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert Errors.InsufficientAllowance();
        }
    }

    function _safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory data) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", to, amount)
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert Errors.LiquidityUnavailable();
        }
    }
}
