// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DataTypes
 * @notice Library containing all data structures used across the ArcLend protocol.
 */
library DataTypes {
    /**
     * @notice Represents a user's lending and borrowing position.
     * @dev In the actual contract, mappings are used for per-asset tracking.
     *      This struct is used for view function return values.
     * @param shareBalance The user's share token balance for the supply asset.
     * @param collateralBalance The user's locked collateral amount.
     * @param borrowPrincipal The principal amount at the time of borrow.
     * @param borrowIndex The interest index snapshot at the user's last borrow update.
     */
    struct UserPosition {
        uint256 shareBalance;
        uint256 collateralBalance;
        uint256 borrowPrincipal;
        uint256 borrowIndex;
    }

    /**
     * @notice Pool-level state for a given asset.
     * @param totalShares Total share tokens minted for this pool.
     * @param totalDeposits Total underlying assets held in the pool.
     * @param totalBorrows Total outstanding borrows from the pool.
     * @param totalReserves Protocol reserves accumulated from interest revenue.
     * @param lastAccrualBlock The last block number at which interest was accrued.
     * @param borrowIndex Cumulative borrow interest index (ray, 1e27 = 1.0).
     * @param depositsPaused Whether deposit operations are paused.
     * @param withdrawalsPaused Whether withdrawal operations are paused.
     * @param borrowsPaused Whether borrow operations are paused.
     * @param repaymentsPaused Whether repayment operations are paused.
     */
    struct PoolState {
        uint256 totalShares;
        uint256 totalDeposits;
        uint256 totalBorrows;
        uint256 totalReserves;
        uint256 lastAccrualBlock;
        uint256 borrowIndex;
        bool depositsPaused;
        bool withdrawalsPaused;
        bool borrowsPaused;
        bool repaymentsPaused;
    }

    /**
     * @notice Parameters for the piecewise linear interest rate model.
     * @param baseRate Minimum borrow rate (annualized, in ray — 1e27 precision).
     * @param baseSlope Rate increase per unit utilization below the kink (ray).
     * @param jumpSlope Rate increase per unit utilization above the kink (ray, must be > baseSlope).
     * @param kink Utilization threshold where the slope changes (ray, 1%–99%).
     * @param reserveFactor Protocol's share of interest revenue (ray, 0%–50%).
     */
    struct RateModelParams {
        uint256 baseRate;
        uint256 baseSlope;
        uint256 jumpSlope;
        uint256 kink;
        uint256 reserveFactor;
    }

    /**
     * @notice Configuration for a collateral asset.
     * @param collateralFactor Loan-to-value ratio (ray, e.g., 0.8e27 = 80%).
     * @param liquidationIncentive Bonus for liquidators (ray, e.g., 0.05e27 = 5%).
     * @param priceFeed Address of the Chainlink-compatible oracle feed.
     * @param isActive Whether this asset is accepted as collateral.
     */
    struct CollateralConfig {
        uint256 collateralFactor;
        uint256 liquidationIncentive;
        address priceFeed;
        bool isActive;
    }
}
