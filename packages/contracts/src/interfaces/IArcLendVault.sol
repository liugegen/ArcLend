// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {DataTypes} from "../libraries/DataTypes.sol";

/**
 * @title IArcLendVault
 * @notice Interface for the core ArcLend lending vault contract.
 * Manages deposits, withdrawals, borrows, repayments, and liquidations
 * using a share-based accounting model.
 */
interface IArcLendVault {
    /**
     * @notice Deposit assets into the lending pool and receive share tokens.
     * @param asset The address of the ERC-20 token to deposit.
     * @param amount The amount of tokens to deposit.
     * @return shares The number of share tokens minted to the depositor.
     */
    function deposit(address asset, uint256 amount) external returns (uint256 shares);

    /**
     * @notice Withdraw assets from the lending pool by burning share tokens.
     * @param asset The address of the ERC-20 token to withdraw.
     * @param shares The number of share tokens to burn.
     * @return amount The amount of underlying tokens returned to the user.
     */
    function withdraw(address asset, uint256 shares) external returns (uint256 amount);

    /**
     * @notice Deposit collateral (e.g., USYC) into the protocol.
     * @param asset The address of the collateral token.
     * @param amount The amount of collateral to deposit.
     */
    function depositCollateral(address asset, uint256 amount) external;

    /**
     * @notice Withdraw collateral from the protocol.
     * @param asset The address of the collateral token.
     * @param amount The amount of collateral to withdraw.
     */
    function withdrawCollateral(address asset, uint256 amount) external;

    /**
     * @notice Borrow assets against deposited collateral.
     * @param asset The address of the ERC-20 token to borrow.
     * @param amount The amount of tokens to borrow.
     */
    function borrow(address asset, uint256 amount) external;

    /**
     * @notice Repay borrowed assets to reduce outstanding debt.
     * @param asset The address of the ERC-20 token to repay.
     * @param amount The amount of tokens to repay.
     * @return actualRepaid The actual amount applied to the debt (may be less than amount if overpaying).
     */
    function repay(address asset, uint256 amount) external returns (uint256 actualRepaid);

    /**
     * @notice Liquidate an undercollateralized borrower's position.
     * @param borrower The address of the borrower to liquidate.
     * @param debtAsset The address of the debt token being repaid.
     * @param repayAmount The amount of debt to repay on behalf of the borrower.
     * @return collateralSeized The amount of collateral seized from the borrower.
     */
    function liquidate(
        address borrower,
        address debtAsset,
        uint256 repayAmount
    ) external returns (uint256 collateralSeized);

    /**
     * @notice Get the health factor for a user's position.
     * @param user The address of the user.
     * @return The health factor in ray (1e27 = HF of 1.0).
     */
    function getHealthFactor(address user) external view returns (uint256);

    /**
     * @notice Get the full position details for a user.
     * @param user The address of the user.
     * @return The user's position data.
     */
    function getUserPosition(address user) external view returns (DataTypes.UserPosition memory);

    /**
     * @notice Get the current state of a lending pool for a given asset.
     * @param asset The address of the asset.
     * @return The pool state data.
     */
    function getPoolState(address asset) external view returns (DataTypes.PoolState memory);
}
