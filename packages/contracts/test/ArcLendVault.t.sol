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
 * @notice Tests for ArcLendVault v2 (auto-collateral model).
 *         Supplied assets automatically serve as collateral.
 *         Cross-asset borrowing: Supply USDC → Borrow EURC.
 */
contract ArcLendVaultTest is Test {
    ArcLendVault public vault;
    InterestRateModel public rateModel;
    PriceOracle public oracle;
    TestAggregator public usdcFeed;
    TestAggregator public eurcFeed;

    MockERC20 public usdc;
    MockERC20 public eurc;

    uint256 public constant RAY = 1e27;

    address public admin;
    address public alice;
    address public bob;
    address public liquidator;

    // Rate model params
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

        // Deploy mock tokens (6 decimals like USDC/EURC)
        usdc = new MockERC20("USD Coin", "USDC", 6);
        eurc = new MockERC20("Euro Coin", "EURC", 6);

        // Deploy price feeds ($1 = 1e8)
        usdcFeed = new TestAggregator(8, 1e8);
        eurcFeed = new TestAggregator(8, 1e8);

        // Deploy oracle
        vm.startPrank(admin);
        oracle = new PriceOracle(admin);
        oracle.setAssetFeed(address(usdc), address(usdcFeed));
        oracle.setAssetFeed(address(eurc), address(eurcFeed));
        vm.stopPrank();

        // Deploy rate model
        rateModel = new InterestRateModel(
            admin,
            baseRate,
            baseSlope,
            jumpSlope,
            kink,
            reserveFactorRate
        );

        // Deploy vault (auto-collateral model)
        address[] memory assets = new address[](2);
        assets[0] = address(usdc);
        assets[1] = address(eurc);

        vault = new ArcLendVault(
            admin,
            address(rateModel),
            address(oracle),
            assets,
            collateralFactor,
            liquidationIncentive
        );

        // Mint tokens to users
        usdc.mint(alice, 10_000e6);
        usdc.mint(bob, 10_000e6);
        usdc.mint(liquidator, 10_000e6);
        eurc.mint(alice, 10_000e6);
        eurc.mint(bob, 10_000e6);
        eurc.mint(liquidator, 10_000e6);

        // Approve vault
        vm.startPrank(alice);
        usdc.approve(address(vault), type(uint256).max);
        eurc.approve(address(vault), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(bob);
        usdc.approve(address(vault), type(uint256).max);
        eurc.approve(address(vault), type(uint256).max);
        vm.stopPrank();

        vm.startPrank(liquidator);
        usdc.approve(address(vault), type(uint256).max);
        eurc.approve(address(vault), type(uint256).max);
        vm.stopPrank();
    }

    // ─── Supply Tests ───────────────────────────────────────────────────────

    function test_deposit_usdc() public {
        vm.prank(alice);
        uint256 shares = vault.deposit(address(usdc), 1000e6);

        assertEq(shares, 1000e6);
        assertEq(vault.userShares(alice, address(usdc)), 1000e6);
    }

    function test_deposit_eurc() public {
        vm.prank(alice);
        uint256 shares = vault.deposit(address(eurc), 500e6);

        assertEq(shares, 500e6);
        assertEq(vault.userShares(alice, address(eurc)), 500e6);
    }

    // ─── Borrow Tests (Cross-Asset) ─────────────────────────────────────────

    function test_borrow_eurc_against_usdc_supply() public {
        // Alice supplies 1000 USDC
        vm.prank(alice);
        vault.deposit(address(usdc), 1000e6);

        // Bob supplies 1000 EURC (provides liquidity for Alice to borrow)
        vm.prank(bob);
        vault.deposit(address(eurc), 1000e6);

        // Alice borrows 500 EURC (within 80% LTV: 1000 * 0.8 = 800 max)
        vm.prank(alice);
        vault.borrow(address(eurc), 500e6);

        assertEq(vault.userBorrowPrincipal(alice, address(eurc)), 500e6);
        assertEq(eurc.balanceOf(alice), 10_500e6); // 10000 initial + 500 borrowed
    }

    function test_borrow_usdc_against_eurc_supply() public {
        // Alice supplies 1000 EURC
        vm.prank(alice);
        vault.deposit(address(eurc), 1000e6);

        // Bob supplies 1000 USDC (provides liquidity)
        vm.prank(bob);
        vault.deposit(address(usdc), 1000e6);

        // Alice borrows 600 USDC (within 80% LTV)
        vm.prank(alice);
        vault.borrow(address(usdc), 600e6);

        assertEq(vault.userBorrowPrincipal(alice, address(usdc)), 600e6);
    }

    function test_borrow_reverts_undercollateralized() public {
        // Alice supplies 1000 USDC
        vm.prank(alice);
        vault.deposit(address(usdc), 1000e6);

        // Bob supplies EURC for liquidity
        vm.prank(bob);
        vault.deposit(address(eurc), 5000e6);

        // Alice tries to borrow 900 EURC (exceeds 80% LTV of 800)
        vm.prank(alice);
        vm.expectRevert(Errors.Undercollateralized.selector);
        vault.borrow(address(eurc), 900e6);
    }

    // ─── Repay Tests ────────────────────────────────────────────────────────

    function test_repay_full() public {
        // Setup: Alice supplies USDC, borrows EURC
        vm.prank(alice);
        vault.deposit(address(usdc), 1000e6);
        vm.prank(bob);
        vault.deposit(address(eurc), 1000e6);
        vm.prank(alice);
        vault.borrow(address(eurc), 500e6);

        // Alice repays full debt
        vm.prank(alice);
        uint256 repaid = vault.repay(address(eurc), 500e6);

        assertEq(repaid, 500e6);
        assertEq(vault.userBorrowPrincipal(alice, address(eurc)), 0);
    }

    function test_repay_partial() public {
        vm.prank(alice);
        vault.deposit(address(usdc), 1000e6);
        vm.prank(bob);
        vault.deposit(address(eurc), 1000e6);
        vm.prank(alice);
        vault.borrow(address(eurc), 500e6);

        // Alice repays 200 EURC
        vm.prank(alice);
        uint256 repaid = vault.repay(address(eurc), 200e6);

        assertEq(repaid, 200e6);
        assertEq(vault.userBorrowPrincipal(alice, address(eurc)), 300e6);
    }

    // ─── Withdraw Tests ─────────────────────────────────────────────────────

    function test_withdraw_full_no_borrows() public {
        vm.prank(alice);
        vault.deposit(address(usdc), 1000e6);

        vm.prank(alice);
        uint256 amount = vault.withdraw(address(usdc), 1000e6);

        assertEq(amount, 1000e6);
        assertEq(vault.userShares(alice, address(usdc)), 0);
    }

    function test_withdraw_reverts_if_undercollateralized() public {
        // Alice supplies 1000 USDC, borrows 700 EURC
        vm.prank(alice);
        vault.deposit(address(usdc), 1000e6);
        vm.prank(bob);
        vault.deposit(address(eurc), 1000e6);
        vm.prank(alice);
        vault.borrow(address(eurc), 700e6);

        // Alice tries to withdraw 500 USDC (would leave 500 supply, 700 debt → HF < 1)
        vm.prank(alice);
        vm.expectRevert(Errors.Undercollateralized.selector);
        vault.withdraw(address(usdc), 500e6);
    }

    // ─── Health Factor Tests ────────────────────────────────────────────────

    function test_health_factor_no_borrows() public {
        vm.prank(alice);
        vault.deposit(address(usdc), 1000e6);

        uint256 hf = vault.getHealthFactor(alice);
        assertEq(hf, type(uint256).max); // Infinite when no debt
    }

    function test_health_factor_with_borrows() public {
        vm.prank(alice);
        vault.deposit(address(usdc), 1000e6);
        vm.prank(bob);
        vault.deposit(address(eurc), 1000e6);

        vm.prank(alice);
        vault.borrow(address(eurc), 500e6);

        // HF = (1000 * 0.8) / 500 = 1.6 in ray
        uint256 hf = vault.getHealthFactor(alice);
        // Should be approximately 1.6e27
        assertGt(hf, 1.5e27);
        assertLt(hf, 1.7e27);
    }

    // ─── Borrow Power Tests ─────────────────────────────────────────────────

    function test_borrow_power() public {
        vm.prank(alice);
        vault.deposit(address(usdc), 1000e6);

        uint256 power = vault.getBorrowPower(alice);
        assertEq(power, 800e6); // 1000 * 80%
    }

    function test_borrow_power_multi_asset() public {
        vm.prank(alice);
        vault.deposit(address(usdc), 1000e6);
        vm.prank(alice);
        vault.deposit(address(eurc), 500e6);

        uint256 power = vault.getBorrowPower(alice);
        assertEq(power, 1200e6); // (1000 + 500) * 80%
    }

    // ─── Liquidation Tests ──────────────────────────────────────────────────

    function test_liquidation_seizes_supply_shares() public {
        // Alice supplies 1000 USDC, borrows 750 EURC (near max)
        vm.prank(alice);
        vault.deposit(address(usdc), 1000e6);
        vm.prank(bob);
        vault.deposit(address(eurc), 2000e6);
        vm.prank(alice);
        vault.borrow(address(eurc), 750e6);

        // Simulate price drop by reducing collateral factor
        vm.prank(admin);
        vault.setCollateralFactor(0.50e27); // Drop to 50% → Alice becomes undercollateralized

        // Liquidator repays 200 EURC of Alice's debt
        vm.prank(liquidator);
        uint256 seized = vault.liquidate(alice, address(eurc), 200e6);

        // Seized should be ~210 (200 * 1.05 incentive)
        assertGt(seized, 200e6);
        assertLt(seized, 220e6);
    }

    function test_liquidation_reverts_healthy_position() public {
        vm.prank(alice);
        vault.deposit(address(usdc), 1000e6);
        vm.prank(bob);
        vault.deposit(address(eurc), 1000e6);
        vm.prank(alice);
        vault.borrow(address(eurc), 100e6); // Very safe position

        vm.prank(liquidator);
        vm.expectRevert(Errors.PositionHealthy.selector);
        vault.liquidate(alice, address(eurc), 50e6);
    }

    // ─── Interest Accrual Tests ─────────────────────────────────────────────

    function test_interest_accrues_on_borrows() public {
        vm.prank(alice);
        vault.deposit(address(usdc), 1000e6);
        vm.prank(bob);
        vault.deposit(address(eurc), 1000e6);
        vm.prank(alice);
        vault.borrow(address(eurc), 500e6);

        // Record block after borrow
        uint256 blockAfterBorrow = block.number;

        // Advance 1 year of blocks
        uint256 blocksToAdvance = 15_768_000;
        vm.roll(blockAfterBorrow + blocksToAdvance);

        // Verify block actually advanced
        assertEq(block.number, blockAfterBorrow + blocksToAdvance);

        // Trigger accrual via repay (which calls _accrueInterest)
        vm.prank(alice);
        uint256 repaid = vault.repay(address(eurc), 1e6);

        // If interest accrued, the outstanding debt should be > 500e6
        // So repaying 1e6 should succeed and debt should still be > 499e6
        assertGt(repaid, 0);

        // Check pool state shows increased borrows
        DataTypes.PoolState memory pool = vault.getPoolState(address(eurc));
        // After 1 year at ~5.5% rate, borrows should be ~527.5e6 minus the 1e6 repaid
        assertGt(pool.totalBorrows, 500e6);
    }

    // ─── Full Flow Test ─────────────────────────────────────────────────────

    function test_full_flow_supply_borrow_repay_withdraw() public {
        // 1. Alice supplies 1000 USDC
        vm.prank(alice);
        vault.deposit(address(usdc), 1000e6);

        // 2. Bob supplies 1000 EURC (liquidity)
        vm.prank(bob);
        vault.deposit(address(eurc), 1000e6);

        // 3. Alice borrows 500 EURC
        vm.prank(alice);
        vault.borrow(address(eurc), 500e6);
        assertEq(eurc.balanceOf(alice), 10_500e6);

        // 4. Alice repays 500 EURC
        vm.prank(alice);
        vault.repay(address(eurc), 500e6);
        assertEq(vault.userBorrowPrincipal(alice, address(eurc)), 0);

        // 5. Alice withdraws 1000 USDC
        vm.prank(alice);
        vault.withdraw(address(usdc), 1000e6);
        assertEq(usdc.balanceOf(alice), 10_000e6);
    }
}
