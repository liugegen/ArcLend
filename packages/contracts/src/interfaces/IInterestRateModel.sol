// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IInterestRateModel
 * @notice Interface for the piecewise linear (kinked) interest rate model.
 * Calculates borrow and supply rates based on pool utilization.
 */
interface IInterestRateModel {
    /**
     * @notice Calculate the borrow rate based on current utilization.
     * @dev Uses a piecewise linear curve:
     *   - Below kink: baseRate + (baseSlope × utilization)
     *   - Above kink: baseRate + (baseSlope × kink) + (jumpSlope × (utilization - kink))
     * @param utilization The current utilization rate in ray (1e27 = 100%).
     * @return The annualized borrow rate in ray.
     */
    function getBorrowRate(uint256 utilization) external view returns (uint256);

    /**
     * @notice Calculate the supply rate based on current utilization.
     * @dev supplyRate = borrowRate × utilization × (1 - reserveFactor)
     * @param utilization The current utilization rate in ray (1e27 = 100%).
     * @return The annualized supply rate in ray.
     */
    function getSupplyRate(uint256 utilization) external view returns (uint256);

    /**
     * @notice Calculate the utilization rate for a pool.
     * @dev utilization = totalBorrows / (totalSupply + totalBorrows - totalReserves)
     *      Returns 0 if the denominator is zero.
     * @param totalBorrows The total outstanding borrows in the pool.
     * @param totalSupply The total supplied assets in the pool.
     * @return The utilization rate in ray (1e27 = 100%).
     */
    function getUtilization(uint256 totalBorrows, uint256 totalSupply) external pure returns (uint256);

    /**
     * @notice Updates the base borrow rate.
     * @param _baseRate New base rate in ray. Must be in [0, 5e27].
     */
    function setBaseRate(uint256 _baseRate) external;

    /**
     * @notice Updates the base slope (rate increase per unit utilization below kink).
     * @param _baseSlope New base slope in ray. Must be in [0, 5e27].
     */
    function setBaseSlope(uint256 _baseSlope) external;

    /**
     * @notice Updates the jump slope (rate increase per unit utilization above kink).
     * @param _jumpSlope New jump slope in ray. Must be in [0, 5e27].
     */
    function setJumpSlope(uint256 _jumpSlope) external;

    /**
     * @notice Updates the kink point (utilization threshold).
     * @param _kink New kink value in ray. Must be in [0.01e27, 0.99e27].
     */
    function setKink(uint256 _kink) external;

    /**
     * @notice Updates the reserve factor.
     * @param _reserveFactor New reserve factor in ray. Must be in [0, 0.5e27].
     */
    function setReserveFactor(uint256 _reserveFactor) external;
}
