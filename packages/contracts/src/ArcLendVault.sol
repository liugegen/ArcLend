// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IInterestRateModel} from "./interfaces/IInterestRateModel.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {DataTypes} from "./libraries/DataTypes.sol";
import {Errors} from "./libraries/Errors.sol";
import {Events} from "./libraries/Events.sol";

/**
 * @title ArcLendVault
 * @notice Core lending vault contract for the ArcLend protocol.
 * Manages deposits, withdrawals, borrows, repayments, and liquidations
 * using a share-based accounting model (similar to ERC-4626).
 * @dev Single vault per deployment (multi-asset). Share-based accounting for supply positions.
 *      Debt tracking via a borrow index that compounds per-block interest.
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

    /// @notice The collateral asset address (USYC)
    address public collateralAsset;

    /// @notice Collateral configuration (factor, liquidation incentive, etc.)
    DataTypes.CollateralConfig public collateralConfig;

    /// @notice Mapping of supported lending assets (USDC, EURC)
    mapping(address => bool) public supportedAssets;

    /// @notice Array of supported asset addresses for iteration
    address[] public supportedAssetsList;

    /// @notice Per-asset pool state
    mapping(address => DataTypes.PoolState) internal _poolStates;

    /// @notice User share balances per asset: user => asset => shares
    mapping(address => mapping(address => uint256)) public userShares;

    /// @notice User collateral balances: user => asset => amount
    mapping(address => mapping(address => uint256)) public userCollateral;

    /// @notice User borrow principals per asset: user => asset => principal
    mapping(address => mapping(address => uint256)) public userBorrowPrincipal;

    /// @notice User borrow index snapshots per asset: user => asset => index
    mapping(address => mapping(address => uint256)) public userBorrowIndex;

    /// @notice Protocol bad debt per asset (debt that cannot be recovered due to insufficient collateral)
    mapping(address => uint256) public badDebt;

    // ============ Modifiers ============

    /// @dev Restricts function access to the admin address
    modifier onlyAdmin() {
        if (msg.sender != admin) revert Errors.Unauthorized();
        _;
    }

    // ============ Constructor ============

    /**
     * @notice Initializes the ArcLendVault with dependencies and supported assets.
     * @param _admin The administrator address.
     * @param _interestRateModel The interest rate model contract address.
     * @param _priceOracle The price oracle contract address.
     * @param _supportedAssets Array of supported lending asset addresses (e.g., USDC, EURC).
     * @param _collateralAsset The collateral asset address (USYC).
     * @param _collateralConfig The collateral configuration (factor, liquidation incentive, price feed).
     */
    constructor(
        address _admin,
        address _interestRateModel,
        address _priceOracle,
        address[] memory _supportedAssets,
        address _collateralAsset,
        DataTypes.CollateralConfig memory _collateralConfig
    ) {
        if (_admin == address(0)) revert Errors.InvalidParameter();
        if (_interestRateModel == address(0)) revert Errors.InvalidParameter();
        if (_priceOracle == address(0)) revert Errors.InvalidParameter();
        if (_collateralAsset == address(0)) revert Errors.InvalidParameter();

        admin = _admin;
        interestRateModel = IInterestRateModel(_interestRateModel);
        priceOracle = IPriceOracle(_priceOracle);
        collateralAsset = _collateralAsset;
        collateralConfig = _collateralConfig;

        for (uint256 i = 0; i < _supportedAssets.length; i++) {
            if (_supportedAssets[i] == address(0)) revert Errors.InvalidParameter();
            supportedAssets[_supportedAssets[i]] = true;
            supportedAssetsList.push(_supportedAssets[i]);

            // Initialize pool state with borrowIndex = RAY (1.0)
            _poolStates[_supportedAssets[i]].borrowIndex = RAY;
            _poolStates[_supportedAssets[i]].lastAccrualBlock = block.number;
        }
    }

    // ============ Deposit Functions ============

    /**
     * @notice Deposit assets into the lending pool and receive share tokens.
     * @dev Validates amount > 0, asset is supported, deposits not paused.
     *      Calculates shares as: amount × totalShares / totalDeposits (or amount if first deposit).
     *      Transfers tokens via transferFrom (requires prior approval).
     * @param asset The address of the ERC-20 token to deposit.
     * @param amount The amount of tokens to deposit.
     * @return shares The number of share tokens minted to the depositor.
     */
    function deposit(address asset, uint256 amount) external returns (uint256 shares) {
        // Validate amount > 0
        if (amount == 0) revert Errors.InvalidAmount();

        // Validate asset is supported
        if (!supportedAssets[asset]) revert Errors.UnsupportedAsset();

        // Validate deposits not paused
        DataTypes.PoolState storage pool = _poolStates[asset];
        if (pool.depositsPaused) revert Errors.DepositsPaused();

        // Transfer tokens from user to vault
        // Using transferFrom with require check (safeTransferFrom pattern)
        (bool success, bytes memory data) = asset.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", msg.sender, address(this), amount)
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert Errors.InsufficientAllowance();
        }

        // Calculate shares to mint
        if (pool.totalShares == 0 || pool.totalDeposits == 0) {
            // First deposit: 1:1 ratio
            shares = amount;
        } else {
            // Subsequent deposits: proportional shares
            shares = (amount * pool.totalShares) / pool.totalDeposits;
        }

        // Update pool state
        pool.totalShares += shares;
        pool.totalDeposits += amount;

        // Credit shares to user
        userShares[msg.sender][asset] += shares;

        // Emit event
        emit Events.Deposit(msg.sender, asset, amount, shares);
    }

    /**
     * @notice Deposit collateral (USYC) into the protocol.
     * @dev Validates amount > 0, asset is the configured collateral (USYC).
     *      Transfers tokens, credits user's collateral balance, reads oracle price for event.
     * @param asset The address of the collateral token (must be USYC).
     * @param amount The amount of collateral to deposit.
     */
    function depositCollateral(address asset, uint256 amount) external {
        // Validate amount > 0
        if (amount == 0) revert Errors.InvalidAmount();

        // Validate asset is the configured collateral
        if (asset != collateralAsset) revert Errors.UnsupportedAsset();

        // Transfer collateral tokens from user to vault
        (bool success, bytes memory data) = asset.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", msg.sender, address(this), amount)
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert Errors.InsufficientAllowance();
        }

        // Credit collateral balance to user
        userCollateral[msg.sender][asset] += amount;

        // Read oracle price for event emission
        uint256 oraclePrice = priceOracle.getAssetPrice(asset);

        // Emit event
        emit Events.CollateralDeposit(msg.sender, asset, amount, oraclePrice);
    }

    // ============ Withdrawal Functions ============

    /**
     * @notice Withdraw assets from the lending pool by burning share tokens.
     * @dev Validates shares > 0, user has sufficient shares, withdrawals not paused.
     *      Accrues interest first, then calculates underlying amount as:
     *      shares × totalDeposits / totalShares.
     *      Checks pool liquidity and health factor if user has borrows.
     * @param asset The address of the ERC-20 token to withdraw.
     * @param shares The number of share tokens to burn.
     * @return amount The amount of underlying tokens returned to the user.
     */
    function withdraw(address asset, uint256 shares) external returns (uint256 amount) {
        // Validate shares > 0
        if (shares == 0) revert Errors.InvalidAmount();

        // Validate user has sufficient shares
        if (userShares[msg.sender][asset] < shares) revert Errors.InsufficientShares();

        // Validate withdrawals not paused
        DataTypes.PoolState storage pool = _poolStates[asset];
        if (pool.withdrawalsPaused) revert Errors.WithdrawalsPaused();

        // Accrue interest before calculating exchange rate
        _accrueInterest(asset);

        // Calculate underlying amount: shares × totalDeposits / totalShares
        amount = (shares * pool.totalDeposits) / pool.totalShares;

        // Check pool has enough liquidity (available = totalDeposits - totalBorrows)
        uint256 availableLiquidity = pool.totalDeposits - pool.totalBorrows;
        if (availableLiquidity < amount) revert Errors.LiquidityUnavailable();

        // If user has borrows, check health factor stays >= 1.0 after withdrawal
        bool hasBorrows = false;
        for (uint256 i = 0; i < supportedAssetsList.length; i++) {
            if (userBorrowPrincipal[msg.sender][supportedAssetsList[i]] > 0) {
                hasBorrows = true;
                break;
            }
        }

        if (hasBorrows) {
            // Temporarily reduce shares to simulate post-withdrawal state for HF check
            userShares[msg.sender][asset] -= shares;
            pool.totalShares -= shares;
            pool.totalDeposits -= amount;

            uint256 hf = _calculateHealthFactor(msg.sender);

            // Restore state (we'll apply the actual changes below)
            userShares[msg.sender][asset] += shares;
            pool.totalShares += shares;
            pool.totalDeposits += amount;

            if (hf < RAY) revert Errors.Undercollateralized();
        }

        // Burn shares from user
        userShares[msg.sender][asset] -= shares;

        // Update pool state
        pool.totalShares -= shares;
        pool.totalDeposits -= amount;

        // Transfer underlying tokens to user
        (bool success, bytes memory data) = asset.call(
            abi.encodeWithSignature("transfer(address,uint256)", msg.sender, amount)
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert Errors.LiquidityUnavailable();
        }

        // Emit event
        emit Events.Withdrawal(msg.sender, asset, shares, amount);
    }

    /**
     * @notice Withdraw collateral from the protocol.
     * @dev Validates amount > 0, user has sufficient collateral.
     *      Checks that health factor remains >= 1.0 after withdrawal (or user has no debt).
     * @param asset The address of the collateral token (must be USYC).
     * @param amount The amount of collateral to withdraw.
     */
    function withdrawCollateral(address asset, uint256 amount) external {
        // Validate amount > 0
        if (amount == 0) revert Errors.InvalidAmount();

        // Validate asset is the configured collateral
        if (asset != collateralAsset) revert Errors.UnsupportedAsset();

        // Validate user has sufficient collateral
        if (userCollateral[msg.sender][asset] < amount) revert Errors.InsufficientBalance();

        // Temporarily reduce collateral to check HF
        userCollateral[msg.sender][asset] -= amount;

        // Check health factor remains >= 1.0 (or user has no debt, in which case HF = max)
        uint256 hf = _calculateHealthFactor(msg.sender);
        if (hf < RAY) {
            // Restore collateral and revert
            userCollateral[msg.sender][asset] += amount;
            revert Errors.Undercollateralized();
        }

        // Transfer collateral tokens to user
        (bool success, bytes memory data) = asset.call(
            abi.encodeWithSignature("transfer(address,uint256)", msg.sender, amount)
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            // Restore collateral on transfer failure
            userCollateral[msg.sender][asset] += amount;
            revert Errors.LiquidityUnavailable();
        }

        // Emit event
        emit Events.CollateralWithdrawal(msg.sender, asset, amount);
    }

    // ============ Borrow Functions ============

    /**
     * @notice Borrow assets from the lending pool against deposited collateral.
     * @dev Validates amount > 0, asset is supported, borrows not paused.
     *      Accrues interest, checks oracle freshness for collateral, calculates
     *      health factor after borrow, and reverts if HF < 1.0.
     *      Records borrow principal and index, transfers tokens, emits Borrow event.
     * @param asset The address of the ERC-20 token to borrow.
     * @param amount The amount of tokens to borrow.
     */
    function borrow(address asset, uint256 amount) external {
        // 1. Validate amount > 0
        if (amount == 0) revert Errors.InvalidAmount();

        // 2. Validate asset is supported
        if (!supportedAssets[asset]) revert Errors.UnsupportedAsset();

        // 3. Validate borrows not paused
        DataTypes.PoolState storage pool = _poolStates[asset];
        if (pool.borrowsPaused) revert Errors.BorrowsPaused();

        // 4. Accrue interest
        _accrueInterest(asset);

        // 5. Check pool has enough liquidity (totalDeposits - totalBorrows >= amount)
        uint256 availableLiquidity = pool.totalDeposits - pool.totalBorrows;
        if (availableLiquidity < amount) revert Errors.LiquidityUnavailable();

        // 6. Check oracle freshness for collateral asset
        if (!priceOracle.isFeedFresh(collateralAsset)) revert Errors.StaleOraclePrice();

        // 7. Temporarily record the borrow to check HF
        uint256 existingPrincipal = userBorrowPrincipal[msg.sender][asset];
        uint256 existingIndex = userBorrowIndex[msg.sender][asset];

        uint256 newPrincipal;
        if (existingPrincipal > 0 && existingIndex > 0) {
            // User has existing borrow: calculate current debt, add new amount
            uint256 currentDebt = (existingPrincipal * pool.borrowIndex) / existingIndex;
            newPrincipal = currentDebt + amount;
        } else {
            // New borrow: principal = amount
            newPrincipal = amount;
        }

        // Temporarily set borrow state to check HF
        userBorrowPrincipal[msg.sender][asset] = newPrincipal;
        userBorrowIndex[msg.sender][asset] = pool.borrowIndex;

        // Also temporarily update pool totalBorrows for accurate HF calculation
        pool.totalBorrows += amount;

        // 8. Check HF >= 1.0 after borrow
        uint256 hf = _calculateHealthFactor(msg.sender);
        if (hf < RAY) {
            // Restore state and revert
            userBorrowPrincipal[msg.sender][asset] = existingPrincipal;
            userBorrowIndex[msg.sender][asset] = existingIndex;
            pool.totalBorrows -= amount;
            revert Errors.Undercollateralized();
        }

        // 9. Borrow state is already recorded (from step 7)
        // 10. Pool totalBorrows already updated (from step 7)

        // 11. Transfer tokens to borrower
        (bool success, bytes memory data) = asset.call(
            abi.encodeWithSignature("transfer(address,uint256)", msg.sender, amount)
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert Errors.LiquidityUnavailable();
        }

        // 12. Emit Borrow event
        emit Events.Borrow(msg.sender, asset, amount);
    }

    // ============ Repay Functions ============

    /**
     * @notice Repay borrowed assets to reduce outstanding debt.
     * @dev Validates amount > 0, asset is supported, repayments not paused, user has active debt.
     *      Accrues interest, calculates outstanding debt, applies min(amount, outstandingDebt),
     *      returns any excess to the user, and updates borrow state.
     * @param asset The address of the ERC-20 token to repay.
     * @param amount The amount of tokens the user wishes to repay.
     * @return actualRepaid The actual amount applied to the user's debt.
     */
    function repay(address asset, uint256 amount) external returns (uint256 actualRepaid) {
        // 1. Validate amount > 0
        if (amount == 0) revert Errors.InvalidAmount();

        // 2. Validate asset is supported
        if (!supportedAssets[asset]) revert Errors.UnsupportedAsset();

        // 3. Validate repayments not paused
        DataTypes.PoolState storage pool = _poolStates[asset];
        if (pool.repaymentsPaused) revert Errors.RepaymentsPaused();

        // 4. Validate user has active debt
        uint256 principal = userBorrowPrincipal[msg.sender][asset];
        if (principal == 0) revert Errors.NoActiveDebt();

        // 5. Accrue interest
        _accrueInterest(asset);

        // 6. Calculate outstanding debt: principal × pool.borrowIndex / userBorrowIndex
        uint256 userIdx = userBorrowIndex[msg.sender][asset];
        uint256 outstandingDebt = (principal * pool.borrowIndex) / userIdx;

        // 7. Calculate actual repay amount: min(amount, outstandingDebt)
        actualRepaid = amount < outstandingDebt ? amount : outstandingDebt;

        // 8. Transfer actualRepaid from user to vault
        (bool success, bytes memory data) = asset.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", msg.sender, address(this), actualRepaid)
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert Errors.InsufficientAllowance();
        }

        // 9/10. Update borrow state
        if (actualRepaid == outstandingDebt) {
            // Full repayment: set borrow balance to zero
            userBorrowPrincipal[msg.sender][asset] = 0;
            userBorrowIndex[msg.sender][asset] = 0;
        } else {
            // Partial repayment: update principal to remaining debt at current index
            uint256 newDebt = outstandingDebt - actualRepaid;
            userBorrowPrincipal[msg.sender][asset] = newDebt;
            userBorrowIndex[msg.sender][asset] = pool.borrowIndex;
        }

        // 11. Update pool total borrows
        pool.totalBorrows = pool.totalBorrows > actualRepaid
            ? pool.totalBorrows - actualRepaid
            : 0;

        // 12. If user sent more than outstanding debt, the excess was never taken
        //     (we only transferred actualRepaid via transferFrom, so no excess to return)
        //     Note: We only took min(amount, outstandingDebt) from the user, so no refund needed.

        // 13. Emit Repay event
        emit Events.Repay(msg.sender, asset, actualRepaid);
    }

    // ============ Liquidation Functions ============

    /**
     * @notice Liquidate an undercollateralized borrower's position.
     * @dev Validates borrower HF < 1.0, caps repayAmount at 50% of outstanding debt,
     *      calculates collateral to seize including liquidation incentive, handles
     *      insufficient collateral (bad debt), transfers collateral to liquidator,
     *      reduces borrower debt, and emits Liquidation event.
     * @param borrower The address of the undercollateralized borrower.
     * @param debtAsset The address of the debt asset to repay.
     * @param repayAmount The amount of debt the liquidator wishes to repay.
     * @return collateralSeized The amount of collateral transferred to the liquidator.
     */
    function liquidate(
        address borrower,
        address debtAsset,
        uint256 repayAmount
    ) external returns (uint256 collateralSeized) {
        // 1. Validate repayAmount > 0
        if (repayAmount == 0) revert Errors.InvalidAmount();

        // 2. Accrue interest on the debt asset
        _accrueInterest(debtAsset);

        // 3. Validate borrower HF < 1.0 (revert PositionHealthy if >= 1.0)
        if (_calculateHealthFactor(borrower) >= RAY) revert Errors.PositionHealthy();

        // 4-5. Calculate outstanding debt and cap repay at 50%
        uint256 actualRepay = _calculateActualRepay(borrower, debtAsset, repayAmount);

        // 6-7. Calculate collateral to seize and handle bad debt
        collateralSeized = _calculateAndSeizeCollateral(borrower, debtAsset, actualRepay);

        // 8. Transfer debt tokens from liquidator to vault
        (bool success, bytes memory data) = debtAsset.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", msg.sender, address(this), actualRepay)
        );
        if (!success || (data.length > 0 && !abi.decode(data, (bool)))) {
            revert Errors.InsufficientAllowance();
        }

        // 9. Reduce borrower's debt
        _reduceBorrowerDebt(borrower, debtAsset, actualRepay);

        // 10. Emit Liquidation event
        emit Events.Liquidation(msg.sender, borrower, actualRepay, collateralSeized);
    }

    /**
     * @dev Calculates the actual repay amount capped at 50% of outstanding debt.
     */
    function _calculateActualRepay(
        address borrower,
        address debtAsset,
        uint256 repayAmount
    ) internal view returns (uint256) {
        DataTypes.PoolState storage pool = _poolStates[debtAsset];
        uint256 principal = userBorrowPrincipal[borrower][debtAsset];
        uint256 userIdx = userBorrowIndex[borrower][debtAsset];
        uint256 outstandingDebt = (principal * pool.borrowIndex) / userIdx;

        // Cap at 50% of outstanding debt
        uint256 maxRepay = outstandingDebt / 2;
        return repayAmount < maxRepay ? repayAmount : maxRepay;
    }

    /**
     * @dev Calculates collateral to seize, handles insufficient collateral (bad debt),
     *      and transfers collateral from borrower to liquidator.
     */
    function _calculateAndSeizeCollateral(
        address borrower,
        address debtAsset,
        uint256 actualRepay
    ) internal returns (uint256 collateralSeized) {
        uint256 collateralPrice = priceOracle.getAssetPrice(collateralAsset);
        uint256 incentive = collateralConfig.liquidationIncentive;

        // collateralToSeize (6 dec) = actualRepay (6 dec) * (RAY + incentive) / RAY * 1e8 / collateralPrice
        uint256 collateralToSeize = (actualRepay * (RAY + incentive) * 1e8) / (RAY * collateralPrice);

        uint256 borrowerCollateral = userCollateral[borrower][collateralAsset];

        if (collateralToSeize > borrowerCollateral) {
            // Seize all remaining collateral and record bad debt
            collateralSeized = borrowerCollateral;

            // Bad debt = shortfall in collateral converted to debt token units
            uint256 shortfallCollateral = collateralToSeize - borrowerCollateral;
            uint256 badDebtAmount = (shortfallCollateral * collateralPrice) / 1e8;
            badDebt[debtAsset] += badDebtAmount;
        } else {
            collateralSeized = collateralToSeize;
        }

        // Transfer collateral from borrower to liquidator (update mappings)
        userCollateral[borrower][collateralAsset] -= collateralSeized;
        userCollateral[msg.sender][collateralAsset] += collateralSeized;
    }

    /**
     * @dev Reduces the borrower's debt after liquidation and updates pool state.
     */
    function _reduceBorrowerDebt(
        address borrower,
        address debtAsset,
        uint256 actualRepay
    ) internal {
        DataTypes.PoolState storage pool = _poolStates[debtAsset];
        uint256 principal = userBorrowPrincipal[borrower][debtAsset];
        uint256 userIdx = userBorrowIndex[borrower][debtAsset];
        uint256 outstandingDebt = (principal * pool.borrowIndex) / userIdx;

        if (actualRepay >= outstandingDebt) {
            userBorrowPrincipal[borrower][debtAsset] = 0;
            userBorrowIndex[borrower][debtAsset] = 0;
        } else {
            uint256 remainingDebt = outstandingDebt - actualRepay;
            userBorrowPrincipal[borrower][debtAsset] = remainingDebt;
            userBorrowIndex[borrower][debtAsset] = pool.borrowIndex;
        }

        // Update pool total borrows
        pool.totalBorrows = pool.totalBorrows > actualRepay
            ? pool.totalBorrows - actualRepay
            : 0;
    }

    // ============ Admin Functions ============

    /**
     * @notice Set the liquidation incentive percentage.
     * @dev Only callable by admin. Validates bounds [5%, 10%] → [0.05e27, 0.10e27].
     * @param newIncentive The new liquidation incentive in ray (e.g., 0.05e27 = 5%).
     */
    function setLiquidationIncentive(uint256 newIncentive) external onlyAdmin {
        // Validate bounds: 5% (0.05e27) to 10% (0.10e27)
        uint256 minIncentive = 0.05e27; // 5%
        uint256 maxIncentive = 0.10e27; // 10%

        if (newIncentive < minIncentive || newIncentive > maxIncentive) {
            revert Errors.InvalidParameter();
        }

        uint256 oldIncentive = collateralConfig.liquidationIncentive;
        collateralConfig.liquidationIncentive = newIncentive;

        emit Events.ParameterUpdated("liquidationIncentive", oldIncentive, newIncentive);
    }

    /**
     * @notice Set the collateral factor (LTV ratio).
     * @dev Only callable by admin. Validates bounds [1%, 97%] → [0.01e27, 0.97e27].
     * @param newFactor The new collateral factor in ray (e.g., 0.80e27 = 80%).
     */
    function setCollateralFactor(uint256 newFactor) external onlyAdmin {
        // Validate bounds: 1% (0.01e27) to 97% (0.97e27)
        uint256 minFactor = 0.01e27; // 1%
        uint256 maxFactor = 0.97e27; // 97%

        if (newFactor < minFactor || newFactor > maxFactor) {
            revert Errors.InvalidParameter();
        }

        uint256 oldFactor = collateralConfig.collateralFactor;
        collateralConfig.collateralFactor = newFactor;

        emit Events.ParameterUpdated("collateralFactor", oldFactor, newFactor);
    }

    /**
     * @notice Set all interest rate model parameters at once.
     * @dev Only callable by admin. Delegates to InterestRateModel's individual setters.
     *      The InterestRateModel validates bounds internally.
     *      NOTE: The ArcLendVault must be the admin of the InterestRateModel for this to work.
     * @param _baseRate The new base borrow rate (ray).
     * @param _baseSlope The new slope below kink (ray).
     * @param _jumpSlope The new slope above kink (ray).
     * @param _kink The new utilization kink point (ray).
     * @param _reserveFactor The new protocol reserve factor (ray).
     */
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

    /**
     * @notice Pause or unpause deposit operations for all supported assets.
     * @dev Only callable by admin.
     * @param paused True to pause deposits, false to unpause.
     */
    function pauseDeposits(bool paused) external onlyAdmin {
        for (uint256 i = 0; i < supportedAssetsList.length; i++) {
            _poolStates[supportedAssetsList[i]].depositsPaused = paused;
        }
        emit Events.PauseStatusUpdated("deposit", paused);
    }

    /**
     * @notice Pause or unpause withdrawal operations for all supported assets.
     * @dev Only callable by admin.
     * @param paused True to pause withdrawals, false to unpause.
     */
    function pauseWithdrawals(bool paused) external onlyAdmin {
        for (uint256 i = 0; i < supportedAssetsList.length; i++) {
            _poolStates[supportedAssetsList[i]].withdrawalsPaused = paused;
        }
        emit Events.PauseStatusUpdated("withdraw", paused);
    }

    /**
     * @notice Pause or unpause borrow operations for all supported assets.
     * @dev Only callable by admin.
     * @param paused True to pause borrows, false to unpause.
     */
    function pauseBorrows(bool paused) external onlyAdmin {
        for (uint256 i = 0; i < supportedAssetsList.length; i++) {
            _poolStates[supportedAssetsList[i]].borrowsPaused = paused;
        }
        emit Events.PauseStatusUpdated("borrow", paused);
    }

    /**
     * @notice Pause or unpause repayment operations for all supported assets.
     * @dev Only callable by admin.
     * @param paused True to pause repayments, false to unpause.
     */
    function pauseRepayments(bool paused) external onlyAdmin {
        for (uint256 i = 0; i < supportedAssetsList.length; i++) {
            _poolStates[supportedAssetsList[i]].repaymentsPaused = paused;
        }
        emit Events.PauseStatusUpdated("repay", paused);
    }

    // ============ View Functions ============

    /**
     * @notice Get the current state of a lending pool for a given asset.
     * @param asset The address of the asset.
     * @return The pool state data.
     */
    function getPoolState(address asset) external view returns (DataTypes.PoolState memory) {
        return _poolStates[asset];
    }

    /**
     * @notice Get the health factor for a user's position.
     * @param user The address of the user.
     * @return The health factor in ray (1e27 = HF of 1.0). Returns type(uint256).max if no debt.
     */
    function getHealthFactor(address user) external view returns (uint256) {
        return _calculateHealthFactor(user);
    }

    /**
     * @notice Get the full position details for a user (for a single asset context).
     * @dev Returns position data for the first supported asset. For multi-asset queries,
     *      use individual mapping getters.
     * @param user The address of the user.
     * @return The user's position data.
     */
    function getUserPosition(address user) external view returns (DataTypes.UserPosition memory) {
        DataTypes.UserPosition memory position;

        if (supportedAssetsList.length > 0) {
            address asset = supportedAssetsList[0];
            position.shareBalance = userShares[user][asset];
            position.borrowPrincipal = userBorrowPrincipal[user][asset];
            position.borrowIndex = userBorrowIndex[user][asset];
        }

        position.collateralBalance = userCollateral[user][collateralAsset];

        return position;
    }

    // ============ Internal Functions ============

    /**
     * @dev Calculates the health factor for a user.
     *      healthFactor = (collateralValue * collateralFactor) / totalDebt
     *      Returns type(uint256).max if user has no debt.
     */
    function _calculateHealthFactor(address user) internal view returns (uint256) {
        // Calculate total debt across all supported assets
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

        // If no debt, health factor is infinite
        if (totalDebt == 0) return type(uint256).max;

        // Calculate collateral value in USD (8 decimals from oracle)
        uint256 collateralAmount = userCollateral[user][collateralAsset];
        if (collateralAmount == 0) return 0;

        uint256 collateralPrice = priceOracle.getAssetPrice(collateralAsset);
        // USYC has 6 decimals on Arc testnet, oracle price has 8 decimals
        // collateralValueUSD (8 decimals) = collateralAmount * collateralPrice / 1e6
        uint256 collateralValueUsd = (collateralAmount * collateralPrice) / 1e6;

        // Use stored collateral factor from config
        uint256 factor = collateralConfig.collateralFactor;

        // totalDebt is in token units (6 decimals for USDC/EURC at ~$1)
        // Convert to 8-decimal USD: totalDebt * price / 1e6
        // For simplicity, assume debt assets are $1 stablecoins (USDC/EURC)
        // totalDebtUsd (8 decimals) = totalDebt * 1e8 / 1e6 = totalDebt * 100
        uint256 totalDebtUsd = totalDebt * 100;

        // healthFactor = (collateralValueUsd * collateralFactor) / (totalDebtUsd * RAY)
        // Result in ray: HF of 1.0 = 1e27
        return (collateralValueUsd * factor) / totalDebtUsd;
    }

    /**
     * @dev Accrues interest for a given asset pool.
     *      Calculates blocks elapsed since lastAccrualBlock, gets the borrow rate from
     *      the InterestRateModel, compounds the borrowIndex, updates totalBorrows with
     *      new interest, allocates reserves, and updates lastAccrualBlock.
     * @param asset The address of the asset pool to accrue interest for.
     */
    function _accrueInterest(address asset) internal {
        DataTypes.PoolState storage pool = _poolStates[asset];

        // Calculate blocks elapsed since last accrual
        uint256 blocksElapsed = block.number - pool.lastAccrualBlock;
        if (blocksElapsed == 0) return;

        // If no borrows, just update the last accrual block
        if (pool.totalBorrows == 0) {
            pool.lastAccrualBlock = block.number;
            return;
        }

        // Get current utilization
        // Pass (totalDeposits - totalReserves) as totalSupply to match InterestRateModel.getUtilization
        uint256 totalSupplyForUtil = pool.totalDeposits > pool.totalReserves
            ? pool.totalDeposits - pool.totalReserves
            : 0;
        uint256 utilization = interestRateModel.getUtilization(pool.totalBorrows, totalSupplyForUtil);

        // Get annualized borrow rate from the interest rate model
        uint256 borrowRateAnnual = interestRateModel.getBorrowRate(utilization);

        // Convert annual rate to per-block rate
        // Assuming ~2 second blocks on Arc Network, ~15,768,000 blocks per year
        // perBlockRate = annualRate / blocksPerYear
        uint256 blocksPerYear = 15_768_000;
        uint256 borrowRatePerBlock = borrowRateAnnual / blocksPerYear;

        // Compound the borrow index: newIndex = oldIndex × (1 + ratePerBlock)^blocksElapsed
        // For efficiency, use simple interest approximation for small blocksElapsed
        // simpleInterestFactor = ratePerBlock × blocksElapsed
        uint256 simpleInterestFactor = borrowRatePerBlock * blocksElapsed;

        // Calculate interest accrued on total borrows
        uint256 interestAccrued = (pool.totalBorrows * simpleInterestFactor) / RAY;

        // Update borrow index: newIndex = oldIndex × (RAY + simpleInterestFactor) / RAY
        pool.borrowIndex = (pool.borrowIndex * (RAY + simpleInterestFactor)) / RAY;

        // Update total borrows with accrued interest
        pool.totalBorrows += interestAccrued;

        // Allocate reserves: reserves += interestAccrued × reserveFactor
        // Get reserve factor from the interest rate model
        // Since InterestRateModel stores reserveFactor publicly, we read it
        // For simplicity, we use a direct call pattern
        uint256 reserveFactorRay = _getReserveFactor();
        uint256 reserveIncrease = (interestAccrued * reserveFactorRay) / RAY;
        pool.totalReserves += reserveIncrease;

        // Interest also increases total deposits (lenders earn interest)
        // The portion not going to reserves goes to depositors
        pool.totalDeposits += (interestAccrued - reserveIncrease);

        // Update last accrual block
        pool.lastAccrualBlock = block.number;
    }

    /**
     * @dev Gets the reserve factor from the InterestRateModel contract.
     * @return The reserve factor in ray.
     */
    function _getReserveFactor() internal view returns (uint256) {
        // Call the InterestRateModel's public reserveFactor() getter
        (bool success, bytes memory data) = address(interestRateModel).staticcall(
            abi.encodeWithSignature("reserveFactor()")
        );
        if (success && data.length >= 32) {
            return abi.decode(data, (uint256));
        }
        return 0;
    }
}
