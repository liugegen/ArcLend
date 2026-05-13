// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Errors
 * @notice Library containing all custom error definitions for the ArcLend protocol.
 */
library Errors {
    /// @notice Thrown when a deposit or withdrawal amount is zero or below the minimum.
    error InvalidAmount();

    /// @notice Thrown when a user attempts to deposit an unsupported asset.
    error UnsupportedAsset();

    /// @notice Thrown when the ERC-20 allowance is insufficient for the transfer.
    error InsufficientAllowance();

    /// @notice Thrown when a user's wallet balance is insufficient for the operation.
    error InsufficientBalance();

    /// @notice Thrown when a user attempts to withdraw more shares than they hold.
    error InsufficientShares();

    /// @notice Thrown when the lending pool lacks liquidity to fulfill a withdrawal or borrow.
    error LiquidityUnavailable();

    /// @notice Thrown when an operation would cause the user's health factor to drop below 1.0.
    error Undercollateralized();

    /// @notice Thrown when a liquidator targets a position with health factor >= 1.0.
    error PositionHealthy();

    /// @notice Thrown when the oracle price feed is stale (not updated within 24 hours).
    error StaleOraclePrice();

    /// @notice Thrown when a user attempts to repay but has no outstanding borrow.
    error NoActiveDebt();

    /// @notice Thrown when a non-administrator address calls an admin-only function.
    error Unauthorized();

    /// @notice Thrown when an admin parameter value is outside the valid bounds.
    error InvalidParameter();

    /// @notice Thrown when deposit operations are paused.
    error DepositsPaused();

    /// @notice Thrown when withdrawal operations are paused.
    error WithdrawalsPaused();

    /// @notice Thrown when borrow operations are paused.
    error BorrowsPaused();

    /// @notice Thrown when repayment operations are paused.
    error RepaymentsPaused();
}
