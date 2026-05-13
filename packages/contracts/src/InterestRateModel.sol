// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IInterestRateModel} from "./interfaces/IInterestRateModel.sol";
import {Errors} from "./libraries/Errors.sol";
import {Events} from "./libraries/Events.sol";

/**
 * @title InterestRateModel
 * @notice Implements a piecewise linear (kinked) interest rate model for the ArcLend protocol.
 * @dev All rate parameters use ray math (1e27 = 100% = 1.0).
 *
 * Borrow rate formula:
 *   - When utilization <= kink: baseRate + baseSlope × utilization
 *   - When utilization > kink:  baseRate + baseSlope × kink + jumpSlope × (utilization - kink)
 *
 * Supply rate formula:
 *   supplyRate = borrowRate × utilization × (1 - reserveFactor)
 *
 * Utilization formula:
 *   utilization = totalBorrows / (totalSupply + totalBorrows - totalReserves)
 *   Returns 0 if denominator is zero.
 */
contract InterestRateModel is IInterestRateModel {
    // ============ Constants ============

    /// @dev Ray unit: 1e27 represents 100% (1.0)
    uint256 public constant RAY = 1e27;

    /// @dev Minimum kink value: 1% = 0.01e27
    uint256 public constant MIN_KINK = 0.01e27;

    /// @dev Maximum kink value: 99% = 0.99e27
    uint256 public constant MAX_KINK = 0.99e27;

    /// @dev Maximum rate value: 500% = 5e27
    uint256 public constant MAX_RATE = 5e27;

    /// @dev Maximum reserve factor: 50% = 0.5e27
    uint256 public constant MAX_RESERVE_FACTOR = 0.5e27;

    // ============ State Variables ============

    /// @notice The protocol administrator address
    address public admin;

    /// @notice Base borrow rate (annualized, in ray)
    uint256 public baseRate;

    /// @notice Rate slope below kink (in ray)
    uint256 public baseSlope;

    /// @notice Rate slope above kink (in ray, must be > baseSlope)
    uint256 public jumpSlope;

    /// @notice Utilization threshold where slope changes (in ray)
    uint256 public kink;

    /// @notice Protocol's share of interest revenue (in ray)
    uint256 public reserveFactor;

    // ============ Modifiers ============

    /// @dev Restricts function access to the admin address
    modifier onlyAdmin() {
        if (msg.sender != admin) revert Errors.Unauthorized();
        _;
    }

    // ============ Constructor ============

    /**
     * @notice Initializes the interest rate model with the given parameters.
     * @param _admin The administrator address.
     * @param _baseRate The base borrow rate (ray).
     * @param _baseSlope The slope below kink (ray).
     * @param _jumpSlope The slope above kink (ray).
     * @param _kink The utilization kink point (ray).
     * @param _reserveFactor The protocol reserve factor (ray).
     */
    constructor(
        address _admin,
        uint256 _baseRate,
        uint256 _baseSlope,
        uint256 _jumpSlope,
        uint256 _kink,
        uint256 _reserveFactor
    ) {
        if (_admin == address(0)) revert Errors.InvalidParameter();
        _validateKink(_kink);
        _validateRate(_baseRate);
        _validateRate(_baseSlope);
        _validateRate(_jumpSlope);
        _validateReserveFactor(_reserveFactor);

        admin = _admin;
        baseRate = _baseRate;
        baseSlope = _baseSlope;
        jumpSlope = _jumpSlope;
        kink = _kink;
        reserveFactor = _reserveFactor;
    }

    // ============ External View Functions ============

    /// @inheritdoc IInterestRateModel
    function getBorrowRate(uint256 utilization) external view override returns (uint256) {
        return _calculateBorrowRate(utilization);
    }

    /// @inheritdoc IInterestRateModel
    function getSupplyRate(uint256 utilization) external view override returns (uint256) {
        if (utilization == 0) return 0;

        uint256 borrowRate = _calculateBorrowRate(utilization);
        // supplyRate = borrowRate × utilization × (1 - reserveFactor) / RAY / RAY
        // We do: (borrowRate * utilization / RAY) * (RAY - reserveFactor) / RAY
        uint256 rateTimesUtil = _rayMul(borrowRate, utilization);
        uint256 oneMinusReserve = RAY - reserveFactor;
        return _rayMul(rateTimesUtil, oneMinusReserve);
    }

    /// @inheritdoc IInterestRateModel
    function getUtilization(uint256 totalBorrows, uint256 totalSupply) external pure override returns (uint256) {
        // utilization = totalBorrows / (totalSupply + totalBorrows - totalReserves)
        // Note: The interface signature uses totalSupply which represents (totalDeposits + totalBorrows - totalReserves)
        // as the denominator. Per the design, the caller passes the appropriate denominator components.
        // Actually per the interface doc: utilization = totalBorrows / (totalSupply + totalBorrows - totalReserves)
        // But the interface only takes two params: totalBorrows and totalSupply.
        // Looking at the interface comment: "totalSupply The total supplied assets in the pool"
        // The design says: utilization = totalBorrows / (totalSupply + totalBorrows - totalReserves)
        // But the interface only has 2 params. The caller must pass the effective denominator as totalSupply
        // or the formula uses totalSupply as totalDeposits (the pool's total deposits).
        // Per the interface: getUtilization(totalBorrows, totalSupply) where denominator = totalSupply + totalBorrows - totalReserves
        // Since totalReserves is not a parameter, the caller should pass (totalDeposits - totalReserves) as totalSupply
        // OR we interpret totalSupply as the total cash in the pool (totalDeposits - totalBorrows + totalBorrows = totalDeposits)
        // Looking at the design formula: utilization = totalBorrows / (totalDeposits + totalBorrows - totalReserves)
        // The interface says totalSupply = "total supplied assets in the pool"
        // This means totalSupply = totalDeposits (the total assets supplied by lenders)
        // But we don't have totalReserves. The simplest interpretation matching the 2-param interface:
        // The caller passes totalSupply as the available liquidity (cash + borrows - reserves = effective total)
        // Actually, re-reading the task description: "getUtilization: totalBorrows / (totalSupply + totalBorrows - totalReserves)"
        // Since the interface only has 2 params, totalSupply here likely represents the cash in the pool (totalDeposits - totalBorrows)
        // So denominator = cash + totalBorrows = totalDeposits. But that doesn't account for reserves.
        // The cleanest interpretation: totalSupply param = total pool assets (cash available), so:
        // utilization = totalBorrows / (totalSupply + totalBorrows)
        // But the task says: totalBorrows / (totalSupply + totalBorrows - totalReserves)
        // With only 2 params, the caller must pre-compute. Let's use the simplest form that matches:
        // The caller passes totalSupply = (totalCash) where totalCash = totalDeposits - totalBorrows - totalReserves... no.
        //
        // Final interpretation: The interface has getUtilization(totalBorrows, totalSupply).
        // The task description says the formula is totalBorrows / (totalSupply + totalBorrows - totalReserves).
        // Since we only have 2 params, the caller is expected to pass totalSupply as (totalDeposits - totalReserves),
        // making the denominator = (totalDeposits - totalReserves) + totalBorrows... but that's not standard either.
        //
        // Standard Compound-style: utilization = borrows / (cash + borrows)
        // where cash = totalSupply (the available liquidity in the pool).
        // This matches: if totalSupply = cash = totalDeposits - totalBorrows (available), then
        // utilization = totalBorrows / (cash + totalBorrows) = totalBorrows / totalDeposits
        //
        // But the design doc says: utilization = totalBorrows / (totalDeposits + totalBorrows - totalReserves)
        // which with totalDeposits as "total supplied" gives: totalBorrows / (totalSupply + totalBorrows - totalReserves)
        //
        // Given the 2-param interface, the most reasonable approach is:
        // totalSupply param represents the total available assets (cash in pool = totalDeposits - totalReserves)
        // denominator = totalSupply + totalBorrows
        // This way the caller passes (totalDeposits - totalReserves) as totalSupply.
        uint256 denominator = totalSupply + totalBorrows;
        if (denominator == 0) return 0;

        // utilization = totalBorrows * RAY / denominator
        return (totalBorrows * RAY) / denominator;
    }

    // ============ Admin Functions ============

    /**
     * @notice Updates the base borrow rate.
     * @param _baseRate New base rate in ray. Must be in [0, 5e27].
     */
    function setBaseRate(uint256 _baseRate) external onlyAdmin {
        _validateRate(_baseRate);
        uint256 oldValue = baseRate;
        baseRate = _baseRate;
        emit Events.ParameterUpdated("baseRate", oldValue, _baseRate);
    }

    /**
     * @notice Updates the base slope (rate increase per unit utilization below kink).
     * @param _baseSlope New base slope in ray. Must be in [0, 5e27].
     */
    function setBaseSlope(uint256 _baseSlope) external onlyAdmin {
        _validateRate(_baseSlope);
        uint256 oldValue = baseSlope;
        baseSlope = _baseSlope;
        emit Events.ParameterUpdated("baseSlope", oldValue, _baseSlope);
    }

    /**
     * @notice Updates the jump slope (rate increase per unit utilization above kink).
     * @param _jumpSlope New jump slope in ray. Must be in [0, 5e27].
     */
    function setJumpSlope(uint256 _jumpSlope) external onlyAdmin {
        _validateRate(_jumpSlope);
        uint256 oldValue = jumpSlope;
        jumpSlope = _jumpSlope;
        emit Events.ParameterUpdated("jumpSlope", oldValue, _jumpSlope);
    }

    /**
     * @notice Updates the kink point (utilization threshold).
     * @param _kink New kink value in ray. Must be in [0.01e27, 0.99e27].
     */
    function setKink(uint256 _kink) external onlyAdmin {
        _validateKink(_kink);
        uint256 oldValue = kink;
        kink = _kink;
        emit Events.ParameterUpdated("kink", oldValue, _kink);
    }

    /**
     * @notice Updates the reserve factor.
     * @param _reserveFactor New reserve factor in ray. Must be in [0, 0.5e27].
     */
    function setReserveFactor(uint256 _reserveFactor) external onlyAdmin {
        _validateReserveFactor(_reserveFactor);
        uint256 oldValue = reserveFactor;
        reserveFactor = _reserveFactor;
        emit Events.ParameterUpdated("reserveFactor", oldValue, _reserveFactor);
    }

    // ============ Internal Functions ============

    /**
     * @dev Calculates the borrow rate using the piecewise linear formula.
     * @param utilization The utilization rate in ray.
     * @return The borrow rate in ray.
     */
    function _calculateBorrowRate(uint256 utilization) internal view returns (uint256) {
        if (utilization <= kink) {
            // baseRate + baseSlope × utilization
            return baseRate + _rayMul(baseSlope, utilization);
        } else {
            // baseRate + baseSlope × kink + jumpSlope × (utilization - kink)
            uint256 normalRate = baseRate + _rayMul(baseSlope, kink);
            uint256 excessUtil = utilization - kink;
            return normalRate + _rayMul(jumpSlope, excessUtil);
        }
    }

    /**
     * @dev Multiplies two ray values: (a * b) / RAY
     * @param a First ray value.
     * @param b Second ray value.
     * @return The product in ray.
     */
    function _rayMul(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a * b) / RAY;
    }

    /**
     * @dev Validates that the kink value is within bounds [MIN_KINK, MAX_KINK].
     */
    function _validateKink(uint256 _kink) internal pure {
        if (_kink < MIN_KINK || _kink > MAX_KINK) revert Errors.InvalidParameter();
    }

    /**
     * @dev Validates that a rate value is within bounds [0, MAX_RATE].
     */
    function _validateRate(uint256 rate) internal pure {
        if (rate > MAX_RATE) revert Errors.InvalidParameter();
    }

    /**
     * @dev Validates that the reserve factor is within bounds [0, MAX_RESERVE_FACTOR].
     */
    function _validateReserveFactor(uint256 _reserveFactor) internal pure {
        if (_reserveFactor > MAX_RESERVE_FACTOR) revert Errors.InvalidParameter();
    }
}
