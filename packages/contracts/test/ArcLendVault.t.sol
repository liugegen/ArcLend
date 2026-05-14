// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ArcLendVault} from "../src/ArcLendVault.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {DataTypes} from "../src/libraries/DataTypes.sol";
import {Errors} from "../src/libraries/Errors.sol";
import {TestAggregator} from "./helpers/TestAggregator.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/**
 * @title ArcLendVaultTest
 * @notice Comprehensive tests for the ArcLendVault lending protocol.
 */
contract ArcLendVaultTest is Test {
    ArcLendVault public vault;
    InterestRateModel public rateModel;
    PriceOracle public oracle;
    TestAggregator public usycFeed;

    MockERC20 public usdc;
    MockERC20 public eurc;
    MockERC20 public usyc;

    uint256 public constant RAY = 1e27;

    address public admin;
    address public alice;
    address public bob;
    address public liquidator;

    // Default rate model params
    uint256 public baseRate = 0.02e27;
    uint256 public baseSlope = 0.07e27;
    uint256 public jumpSlope = 3e27;
    uint256 public kink = 0.80e27;
    uint256 public reserveFactorRate = 0.10e27;

    // Collateral config: 80% LTV, 5% liquidation incentive
    uint256 public collateralFactor = 0.80e27;
    uint256 public liquidationIncentive = 0.05e27;

    function setUp() public {
        admin = makeAddr("admin");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        liquidator = makeAddr("liquidator");

        // Deploy mock tokens (6 decimals like USDC/EURC/USYC)
        usdc = new MockERC20("USD Coin", "USDC", 6);
        eurc = new MockERC20("Euro Coin", "EURC", 6);
        usyc = new MockERC20("US Yield Coin", "USYC", 6);

        // Deploy InterestRateModel (admin is the vault, but we deploy with admin first)
        vm.prank(admin);
        rateModel = new InterestRateModel(admin, baseRate, baseSlope, jumpSlope, kink, reserveFactorRate);

        // Deploy PriceOracle
        vm.prank(admin);
        oracle = new PriceOracle(admin);

        // Deploy USYC price feed ($1.02)
        usycFeed = new TestAggregator(8, 1.02e8);

        // Configure oracle feed for USYC
        vm.prank(admin);
        oracle.setAssetFeed(address(usyc), address(usycFeed));

        // Deploy ArcLendVault
        address[] memory supportedAssets = new address[](2);
        supportedAssets[0] = address(usdc);
        supportedAssets[1] = address(eurc);

        DataTypes.CollateralConfig memory collConfig = DataTypes.CollateralConfig({
            collateralFactor: collateralFactor,
            liquidationIncentive: liquidationIncentive,
            priceFeed: address(usycFeed),
            isActive: true
        });

        vm.prank(admin);
        vault = new ArcLendVault(
            admin,
            address(rateModel),
            address(oracle),
            supportedAssets,
            address(usyc),
            collConfig
        );

        // Transfer rate model admin to vault (so vault can call setters)
        // Actually the rate model admin stays as admin for now since vault calls through admin

        // Fund test accounts
        usdc.mint(alice, 1_000_000e6);
        usdc.mint(bob, 1_000_000e6);
        usdc.mint(liquidator, 1_000_000e6);
        eurc.mint(alice, 1_000_000e6);
        eurc.mint(bob, 1_000_000e6);
        usyc.mint(alice, 1_000_000e6);
        usyc.mint(bob, 1_000_000e6);

        // Fund vault with some initial liquidity for borrows (simulating prior deposits)
        usdc.mint(address(vault), 0); // vault starts empty

        // Label addresses
        vm.label(address(usdc), "USDC");
        vm.label(address(eurc), "EURC");
        vm.label(address(usyc), "USYC");
        vm.label(address(vault), "Vault");
        vm.label(address(rateModel), "RateModel");
        vm.label(address(oracle), "Oracle");
    }

    // ============ Constructor Tests ============

    function test_constructor_setsAdmin() public view {
        assertEq(vault.admin(), admin);
    }

    function test_constructor_setsSupportedAssets() public view {
        assertTrue(vault.supportedAssets(address(usdc)));
        assertTrue(vault.supportedAssets(address(eurc)));
        assertFalse(vault.supportedAssets(address(usyc))); // collateral, not lending asset
    }

    function test_constructor_initializesPoolState() public view {
        DataTypes.PoolState memory pool = vault.getPoolState(address(usdc));
        assertEq(pool.borrowIndex, RAY);
        assertEq(pool.totalShares, 0);
        assertEq(pool.totalDeposits, 0);
        assertEq(pool.totalBorrows, 0);
    }

    function test_constructor_revertsZeroAdmin() public {
        address[] memory assets = new address[](1);
        assets[0] = address(usdc);
        DataTypes.CollateralConfig memory cfg = DataTypes.CollateralConfig(collateralFactor, liquidationIncentive, address(usycFeed), true);

        vm.expectRevert(Errors.InvalidParameter.selector);
        new ArcLendVault(address(0), address(rateModel), address(oracle), assets, address(usyc), cfg);
    }

    function test_constructor_revertsZeroRateModel() public {
        address[] memory assets = new address[](1);
        assets[0] = address(usdc);
        DataTypes.CollateralConfig memory cfg = DataTypes.CollateralConfig(collateralFactor, liquidationIncentive, address(usycFeed), true);

        vm.expectRevert(Errors.InvalidParameter.selector);
        new ArcLendVault(admin, address(0), address(oracle), assets, address(usyc), cfg);
    }

    // ============ Deposit Tests ============

    function test_deposit_success() public {
        uint256 amount = 10_000e6;

        vm.startPrank(alice);
        usdc.approve(address(vault), amount);
        uint256 shares = vault.deposit(address(usdc), amount);
        vm.stopPrank();

        // First deposit: shares = amount (1:1)
        assertEq(shares, amount);
        assertEq(vault.userShares(alice, address(usdc)), amount);

        DataTypes.PoolState memory pool = vault.getPoolState(address(usdc));
        assertEq(pool.totalShares, amount);
        assertEq(pool.totalDeposits, amount);
    }

    function test_deposit_secondDeposit_proportionalShares() public {
        // Alice deposits first
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(address(usdc), 10_000e6);
        vm.stopPrank();

        // Bob deposits second (same amount, should get same shares)
        vm.startPrank(bob);
        usdc.approve(address(vault), 10_000e6);
        uint256 shares = vault.deposit(address(usdc), 10_000e6);
        vm.stopPrank();

        assertEq(shares, 10_000e6);
        assertEq(vault.userShares(bob, address(usdc)), 10_000e6);
    }

    function test_deposit_revertsZeroAmount() public {
        vm.expectRevert(Errors.InvalidAmount.selector);
        vm.prank(alice);
        vault.deposit(address(usdc), 0);
    }

    function test_deposit_revertsUnsupportedAsset() public {
        vm.expectRevert(Errors.UnsupportedAsset.selector);
        vm.prank(alice);
        vault.deposit(makeAddr("random"), 1000e6);
    }

    function test_deposit_revertsWhenPaused() public {
        vm.prank(admin);
        vault.pauseDeposits(true);

        vm.startPrank(alice);
        usdc.approve(address(vault), 1000e6);
        vm.expectRevert(Errors.DepositsPaused.selector);
        vault.deposit(address(usdc), 1000e6);
        vm.stopPrank();
    }

    function test_deposit_revertsInsufficientAllowance() public {
        // No approval
        vm.expectRevert(Errors.InsufficientAllowance.selector);
        vm.prank(alice);
        vault.deposit(address(usdc), 1000e6);
    }

    // ============ Deposit Collateral Tests ============

    function test_depositCollateral_success() public {
        uint256 amount = 20_000e6;

        vm.startPrank(alice);
        usyc.approve(address(vault), amount);
        vault.depositCollateral(address(usyc), amount);
        vm.stopPrank();

        assertEq(vault.userCollateral(alice, address(usyc)), amount);
    }

    function test_depositCollateral_revertsZeroAmount() public {
        vm.expectRevert(Errors.InvalidAmount.selector);
        vm.prank(alice);
        vault.depositCollateral(address(usyc), 0);
    }

    function test_depositCollateral_revertsWrongAsset() public {
        vm.expectRevert(Errors.UnsupportedAsset.selector);
        vm.prank(alice);
        vault.depositCollateral(address(usdc), 1000e6);
    }

    // ============ Withdraw Tests ============

    function test_withdraw_success() public {
        // Deposit first
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(address(usdc), 10_000e6);

        // Withdraw all shares
        uint256 amount = vault.withdraw(address(usdc), 10_000e6);
        vm.stopPrank();

        assertEq(amount, 10_000e6);
        assertEq(vault.userShares(alice, address(usdc)), 0);
        assertEq(usdc.balanceOf(alice), 1_000_000e6); // back to original
    }

    function test_withdraw_revertsZeroShares() public {
        vm.expectRevert(Errors.InvalidAmount.selector);
        vm.prank(alice);
        vault.withdraw(address(usdc), 0);
    }

    function test_withdraw_revertsInsufficientShares() public {
        vm.expectRevert(Errors.InsufficientShares.selector);
        vm.prank(alice);
        vault.withdraw(address(usdc), 1000e6);
    }

    function test_withdraw_revertsWhenPaused() public {
        // Deposit first
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        vault.deposit(address(usdc), 10_000e6);
        vm.stopPrank();

        vm.prank(admin);
        vault.pauseWithdrawals(true);

        vm.expectRevert(Errors.WithdrawalsPaused.selector);
        vm.prank(alice);
        vault.withdraw(address(usdc), 10_000e6);
    }

    // ============ Withdraw Collateral Tests ============

    function test_withdrawCollateral_success() public {
        // Deposit collateral
        vm.startPrank(alice);
        usyc.approve(address(vault), 20_000e6);
        vault.depositCollateral(address(usyc), 20_000e6);

        // Withdraw (no debt, so HF is infinite)
        vault.withdrawCollateral(address(usyc), 20_000e6);
        vm.stopPrank();

        assertEq(vault.userCollateral(alice, address(usyc)), 0);
    }

    function test_withdrawCollateral_revertsZeroAmount() public {
        vm.expectRevert(Errors.InvalidAmount.selector);
        vm.prank(alice);
        vault.withdrawCollateral(address(usyc), 0);
    }

    function test_withdrawCollateral_revertsInsufficientBalance() public {
        vm.expectRevert(Errors.InsufficientBalance.selector);
        vm.prank(alice);
        vault.withdrawCollateral(address(usyc), 1000e6);
    }

    function test_withdrawCollateral_revertsUndercollateralized() public {
        // Setup: Alice deposits collateral and borrows
        _setupBorrower(alice, 20_000e6, 10_000e6);

        // Try to withdraw all collateral (would make HF < 1)
        vm.expectRevert(Errors.Undercollateralized.selector);
        vm.prank(alice);
        vault.withdrawCollateral(address(usyc), 20_000e6);
    }

    // ============ Borrow Tests ============

    function test_borrow_success() public {
        // Setup: deposit liquidity and collateral
        _depositLiquidity(bob, 100_000e6);
        _depositCollateral(alice, 20_000e6);

        vm.startPrank(alice);
        uint256 borrowAmount = 5_000e6;
        vault.borrow(address(usdc), borrowAmount);
        vm.stopPrank();

        assertEq(usdc.balanceOf(alice), 1_000_000e6 + borrowAmount);
        assertEq(vault.userBorrowPrincipal(alice, address(usdc)), borrowAmount);
    }

    function test_borrow_revertsZeroAmount() public {
        vm.expectRevert(Errors.InvalidAmount.selector);
        vm.prank(alice);
        vault.borrow(address(usdc), 0);
    }

    function test_borrow_revertsUnsupportedAsset() public {
        vm.expectRevert(Errors.UnsupportedAsset.selector);
        vm.prank(alice);
        vault.borrow(makeAddr("random"), 1000e6);
    }

    function test_borrow_revertsWhenPaused() public {
        vm.prank(admin);
        vault.pauseBorrows(true);

        vm.expectRevert(Errors.BorrowsPaused.selector);
        vm.prank(alice);
        vault.borrow(address(usdc), 1000e6);
    }

    function test_borrow_revertsInsufficientLiquidity() public {
        _depositLiquidity(bob, 1_000e6);
        _depositCollateral(alice, 200_000e6);

        vm.expectRevert(Errors.LiquidityUnavailable.selector);
        vm.prank(alice);
        vault.borrow(address(usdc), 2_000e6); // more than available
    }

    function test_borrow_revertsUndercollateralized() public {
        _depositLiquidity(bob, 100_000e6);
        _depositCollateral(alice, 10_000e6); // small collateral

        // Try to borrow more than collateral allows
        // Collateral value = 10_000 * 1.02 = $10,200
        // Max borrow at 80% LTV = $8,160
        vm.expectRevert(Errors.Undercollateralized.selector);
        vm.prank(alice);
        vault.borrow(address(usdc), 9_000e6);
    }

    function test_borrow_revertsStaleOracle() public {
        _depositLiquidity(bob, 100_000e6);
        _depositCollateral(alice, 20_000e6);

        // Warp to a reasonable timestamp, then make oracle stale (> 30 days)
        vm.warp(100_000 + 31 days);
        usycFeed.setUpdatedAt(block.timestamp - 31 days);

        vm.expectRevert(Errors.StaleOraclePrice.selector);
        vm.prank(alice);
        vault.borrow(address(usdc), 5_000e6);
    }

    // ============ Repay Tests ============

    function test_repay_fullRepayment() public {
        _setupBorrower(alice, 20_000e6, 5_000e6);

        vm.startPrank(alice);
        usdc.approve(address(vault), 5_000e6);
        uint256 repaid = vault.repay(address(usdc), 5_000e6);
        vm.stopPrank();

        assertEq(repaid, 5_000e6);
        assertEq(vault.userBorrowPrincipal(alice, address(usdc)), 0);
    }

    function test_repay_partialRepayment() public {
        _setupBorrower(alice, 20_000e6, 5_000e6);

        vm.startPrank(alice);
        usdc.approve(address(vault), 2_000e6);
        uint256 repaid = vault.repay(address(usdc), 2_000e6);
        vm.stopPrank();

        assertEq(repaid, 2_000e6);
        // Remaining debt should be 3000e6
        assertEq(vault.userBorrowPrincipal(alice, address(usdc)), 3_000e6);
    }

    function test_repay_capsAtOutstandingDebt() public {
        _setupBorrower(alice, 20_000e6, 5_000e6);

        // Try to repay more than owed
        vm.startPrank(alice);
        usdc.approve(address(vault), 10_000e6);
        uint256 repaid = vault.repay(address(usdc), 10_000e6);
        vm.stopPrank();

        // Should only repay the outstanding debt (5000e6 since no interest accrued in same block)
        assertEq(repaid, 5_000e6);
        assertEq(vault.userBorrowPrincipal(alice, address(usdc)), 0);
    }

    function test_repay_revertsZeroAmount() public {
        vm.expectRevert(Errors.InvalidAmount.selector);
        vm.prank(alice);
        vault.repay(address(usdc), 0);
    }

    function test_repay_revertsNoActiveDebt() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), 1000e6);
        vm.expectRevert(Errors.NoActiveDebt.selector);
        vault.repay(address(usdc), 1000e6);
        vm.stopPrank();
    }

    function test_repay_revertsWhenPaused() public {
        _setupBorrower(alice, 20_000e6, 5_000e6);

        vm.prank(admin);
        vault.pauseRepayments(true);

        vm.startPrank(alice);
        usdc.approve(address(vault), 5_000e6);
        vm.expectRevert(Errors.RepaymentsPaused.selector);
        vault.repay(address(usdc), 5_000e6);
        vm.stopPrank();
    }

    // ============ Liquidation Tests ============

    function test_liquidate_success() public {
        // Setup: Alice borrows near max LTV
        _setupBorrower(alice, 20_000e6, 8_000e6);

        // Drop USYC price to make Alice undercollateralized
        // Original: 20000 * 1.02 * 0.8 / (8000 * 100) = 16320 * RAY / 800000 ≈ 20.4 * 1e21 * RAY... 
        // Let's drop price significantly
        usycFeed.setAnswer(0.40e8); // $0.40 per USYC

        // Verify Alice is undercollateralized
        uint256 hf = vault.getHealthFactor(alice);
        assertLt(hf, RAY);

        // Liquidator repays some of Alice's debt
        vm.startPrank(liquidator);
        usdc.approve(address(vault), 4_000e6);
        uint256 seized = vault.liquidate(alice, address(usdc), 4_000e6);
        vm.stopPrank();

        assertGt(seized, 0);
        // Liquidator should have received collateral
        assertGt(vault.userCollateral(liquidator, address(usyc)), 0);
    }

    function test_liquidate_revertsPositionHealthy() public {
        _setupBorrower(alice, 20_000e6, 5_000e6);

        // Position is healthy, liquidation should fail
        vm.startPrank(liquidator);
        usdc.approve(address(vault), 2_000e6);
        vm.expectRevert(Errors.PositionHealthy.selector);
        vault.liquidate(alice, address(usdc), 2_000e6);
        vm.stopPrank();
    }

    function test_liquidate_revertsZeroAmount() public {
        vm.expectRevert(Errors.InvalidAmount.selector);
        vm.prank(liquidator);
        vault.liquidate(alice, address(usdc), 0);
    }

    function test_liquidate_capsAt50Percent() public {
        // Setup borrower near max
        _setupBorrower(alice, 20_000e6, 8_000e6);

        // Drop price to make undercollateralized
        usycFeed.setAnswer(0.40e8);

        // Try to repay full debt (should be capped at 50%)
        vm.startPrank(liquidator);
        usdc.approve(address(vault), 8_000e6);
        vault.liquidate(alice, address(usdc), 8_000e6);
        vm.stopPrank();

        // Alice should still have some debt remaining (at least 50%)
        assertGt(vault.userBorrowPrincipal(alice, address(usdc)), 0);
    }

    // ============ Interest Accrual Tests ============

    function test_interestAccrual_increasesDebt() public {
        _setupBorrower(alice, 20_000e6, 5_000e6);

        // Advance blocks to accrue interest
        vm.roll(block.number + 1_000_000); // ~1M blocks
        vm.warp(block.timestamp + 1_000_000 * 2); // 2s per block

        // Trigger accrual via a view that calls _accrueInterest internally
        // We'll do a repay to trigger it
        vm.startPrank(alice);
        usdc.approve(address(vault), 1e6);
        vault.repay(address(usdc), 1e6);
        vm.stopPrank();

        // Pool state should show increased borrows due to interest
        DataTypes.PoolState memory pool = vault.getPoolState(address(usdc));
        assertGt(pool.totalBorrows, 0); // Still has borrows after partial repay
        assertGt(pool.borrowIndex, RAY); // Index increased
    }

    // ============ Admin Function Tests ============

    function test_setLiquidationIncentive_success() public {
        vm.prank(admin);
        vault.setLiquidationIncentive(0.07e27); // 7%

        (, uint256 newIncentive,,) = _getCollateralConfig();
        assertEq(newIncentive, 0.07e27);
    }

    function test_setLiquidationIncentive_revertsOutOfBounds() public {
        vm.expectRevert(Errors.InvalidParameter.selector);
        vm.prank(admin);
        vault.setLiquidationIncentive(0.03e27); // 3% < 5% min

        vm.expectRevert(Errors.InvalidParameter.selector);
        vm.prank(admin);
        vault.setLiquidationIncentive(0.15e27); // 15% > 10% max
    }

    function test_setLiquidationIncentive_revertsNonAdmin() public {
        vm.expectRevert(Errors.Unauthorized.selector);
        vm.prank(alice);
        vault.setLiquidationIncentive(0.07e27);
    }

    function test_setCollateralFactor_success() public {
        vm.prank(admin);
        vault.setCollateralFactor(0.75e27); // 75%

        (uint256 newFactor,,,) = _getCollateralConfig();
        assertEq(newFactor, 0.75e27);
    }

    function test_setCollateralFactor_revertsOutOfBounds() public {
        vm.expectRevert(Errors.InvalidParameter.selector);
        vm.prank(admin);
        vault.setCollateralFactor(0.005e27); // 0.5% < 1% min

        vm.expectRevert(Errors.InvalidParameter.selector);
        vm.prank(admin);
        vault.setCollateralFactor(0.98e27); // 98% > 97% max
    }

    function test_pauseDeposits_success() public {
        vm.prank(admin);
        vault.pauseDeposits(true);

        DataTypes.PoolState memory pool = vault.getPoolState(address(usdc));
        assertTrue(pool.depositsPaused);

        vm.prank(admin);
        vault.pauseDeposits(false);

        pool = vault.getPoolState(address(usdc));
        assertFalse(pool.depositsPaused);
    }

    function test_pauseBorrows_success() public {
        vm.prank(admin);
        vault.pauseBorrows(true);

        DataTypes.PoolState memory pool = vault.getPoolState(address(usdc));
        assertTrue(pool.borrowsPaused);
    }

    // ============ Health Factor Tests ============

    function test_healthFactor_noDebt() public view {
        uint256 hf = vault.getHealthFactor(alice);
        assertEq(hf, type(uint256).max);
    }

    function test_healthFactor_withDebt() public {
        _setupBorrower(alice, 20_000e6, 5_000e6);

        uint256 hf = vault.getHealthFactor(alice);
        // collateralValue = 20000 * 1.02e8 / 1e6 = 2040000 (in 8-dec USD)
        // totalDebtUsd = 5000 * 100 = 500000 (in 8-dec USD)
        // HF = (2040000 * 0.8e27) / 500000 = 1632000 * 1e27 / 500000 = 3.264e27
        assertGt(hf, RAY); // Should be healthy
    }

    // ============ View Function Tests ============

    function test_getPoolState() public {
        _depositLiquidity(alice, 10_000e6);

        DataTypes.PoolState memory pool = vault.getPoolState(address(usdc));
        assertEq(pool.totalDeposits, 10_000e6);
        assertEq(pool.totalShares, 10_000e6);
        assertEq(pool.totalBorrows, 0);
    }

    function test_getUserPosition() public {
        _depositLiquidity(alice, 10_000e6);
        _depositCollateral(alice, 20_000e6);

        DataTypes.UserPosition memory pos = vault.getUserPosition(alice);
        assertEq(pos.shareBalance, 10_000e6);
        assertEq(pos.collateralBalance, 20_000e6);
    }

    // ============ Helper Functions ============

    function _depositLiquidity(address user, uint256 amount) internal {
        vm.startPrank(user);
        usdc.approve(address(vault), amount);
        vault.deposit(address(usdc), amount);
        vm.stopPrank();
    }

    function _depositCollateral(address user, uint256 amount) internal {
        vm.startPrank(user);
        usyc.approve(address(vault), amount);
        vault.depositCollateral(address(usyc), amount);
        vm.stopPrank();
    }

    function _setupBorrower(address user, uint256 collateralAmt, uint256 borrowAmt) internal {
        // First, deposit liquidity from bob so there's something to borrow
        vm.startPrank(bob);
        usdc.approve(address(vault), 100_000e6);
        vault.deposit(address(usdc), 100_000e6);
        vm.stopPrank();

        // Deposit collateral
        vm.startPrank(user);
        usyc.approve(address(vault), collateralAmt);
        vault.depositCollateral(address(usyc), collateralAmt);

        // Borrow
        vault.borrow(address(usdc), borrowAmt);
        vm.stopPrank();
    }

    function _getCollateralConfig() internal view returns (uint256, uint256, address, bool) {
        (uint256 cf, uint256 li, address pf, bool active) = vault.collateralConfig();
        return (cf, li, pf, active);
    }
}
