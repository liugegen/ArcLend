// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Events
 * @notice Library containing all event definitions for the ArcLend protocol.
 */
library Events {
    /**
     * @notice Emitted when a user deposits assets into the lending pool.
     * @param user The address of the depositor.
     * @param asset The address of the deposited asset.
     * @param amount The amount of tokens deposited.
     * @param shares The number of share tokens minted.
     */
    event Deposit(address indexed user, address indexed asset, uint256 amount, uint256 shares);

    /**
     * @notice Emitted when a user withdraws assets from the lending pool.
     * @param user The address of the withdrawer.
     * @param asset The address of the withdrawn asset.
     * @param shares The number of share tokens burned.
     * @param amount The amount of underlying tokens returned.
     */
    event Withdrawal(address indexed user, address indexed asset, uint256 shares, uint256 amount);

    /**
     * @notice Emitted when a user deposits collateral into the protocol.
     * @param user The address of the depositor.
     * @param asset The address of the collateral asset.
     * @param amount The amount of collateral deposited.
     * @param oraclePrice The oracle price used at the time of deposit (8 decimals).
     */
    event CollateralDeposit(address indexed user, address indexed asset, uint256 amount, uint256 oraclePrice);

    /**
     * @notice Emitted when a user withdraws collateral from the protocol.
     * @param user The address of the withdrawer.
     * @param asset The address of the collateral asset.
     * @param amount The amount of collateral withdrawn.
     */
    event CollateralWithdrawal(address indexed user, address indexed asset, uint256 amount);

    /**
     * @notice Emitted when a user borrows assets from the lending pool.
     * @param user The address of the borrower.
     * @param asset The address of the borrowed asset.
     * @param amount The amount of tokens borrowed.
     */
    event Borrow(address indexed user, address indexed asset, uint256 amount);

    /**
     * @notice Emitted when a user repays borrowed assets.
     * @param user The address of the repayer.
     * @param asset The address of the repaid asset.
     * @param amount The actual amount applied to the debt.
     */
    event Repay(address indexed user, address indexed asset, uint256 amount);

    /**
     * @notice Emitted when a liquidation is executed.
     * @param liquidator The address of the liquidator.
     * @param borrower The address of the liquidated borrower.
     * @param debtRepaid The amount of debt repaid by the liquidator.
     * @param collateralSeized The amount of collateral seized from the borrower.
     */
    event Liquidation(
        address indexed liquidator,
        address indexed borrower,
        uint256 debtRepaid,
        uint256 collateralSeized
    );

    /**
     * @notice Emitted when an administrator updates a protocol parameter.
     * @param paramName The name of the parameter that was updated.
     * @param oldValue The previous value of the parameter.
     * @param newValue The new value of the parameter.
     */
    event ParameterUpdated(string paramName, uint256 oldValue, uint256 newValue);

    /**
     * @notice Emitted when an administrator pauses or unpauses an operation.
     * @param operation The name of the operation (e.g., "deposit", "withdraw", "borrow", "repay").
     * @param paused The new pause state (true = paused, false = unpaused).
     */
    event PauseStatusUpdated(string operation, bool paused);
}
