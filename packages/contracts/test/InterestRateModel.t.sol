// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {Errors} from "../src/libraries/Errors.sol";

/**
 * @title InterestRateModelTest
 * @notice Comprehensive tests for the InterestRateModel contract.
 */
contract InterestRateModelTest is Test {
    InterestRateModel public model;

    uint256 public constant RAY = 1e27;

    // Default parameters
    address public admin;
    uint256 public baseRate = 0.02e27; // 2%
    uint256 public baseSlope = 0.07e27; // 7%
    uint256 public jumpSlope = 3e27; // 300%
    uint256 public kink = 0.80e27; // 80%
    uint256 public reserveFactor = 0.10e27; // 10%

    function setUp() public {
        admin = makeAddr("admin");
        vm.prank(admin);
        model = new InterestRateModel(admin, baseRate, baseSlope, jumpSlope, kink, reserveFactor);
    }

    // ============ Constructor Tests ============

    function test_constructor_setsParameters() public view {
        assertEq(model.admin(), admin);
        assertEq(model.baseRate(), baseRate);
        assertEq(model.baseSlope(), baseSlope);
        assertEq(model.jumpSlope(), jumpSlope);
        assertEq(model.kink(), kink);
        assertEq(model.reserveFactor(), reserveFactor);
    }

    function test_constructor_revertsZeroAdmin() public {
        vm.expectRevert(Errors.InvalidParameter.selector);
        new InterestRateModel(address(0), baseRate, baseSlope, jumpSlope, kink, reserveFactor);
    }

    function test_constructor_revertsInvalidKinkTooLow() public {
        vm.expectRevert(Errors.InvalidParameter.selector);
        new InterestRateModel(admin, baseRate, baseSlope, jumpSlope, 0.005e27, reserveFactor);
    }

    function test_constructor_revertsInvalidKinkTooHigh() public {
        vm.expectRevert(Errors.InvalidParameter.selector);
        new InterestRateModel(admin, baseRate, baseSlope, jumpSlope, 0.995e27, reserveFactor);
    }

    function test_constructor_revertsRateTooHigh() public {
        vm.expectRevert(Errors.InvalidParameter.selector);
        new InterestRateModel(admin, 6e27, baseSlope, jumpSlope, kink, reserveFactor);
    }

    function test_constructor_revertsReserveFactorTooHigh() public {
        vm.expectRevert(Errors.InvalidParameter.selector);
        new InterestRateModel(admin, baseRate, baseSlope, jumpSlope, kink, 0.6e27);
    }

    // ============ getBorrowRate Tests ============

    function test_getBorrowRate_zeroUtilization() public view {
        uint256 rate = model.getBorrowRate(0);
        // At 0% utilization: baseRate + baseSlope * 0 = baseRate
        assertEq(rate, baseRate);
    }

    function test_getBorrowRate_belowKink() public view {
        uint256 utilization = 0.50e27; // 50%
        uint256 rate = model.getBorrowRate(utilization);
        // Expected: baseRate + baseSlope * utilization = 0.02e27 + 0.07e27 * 0.5 = 0.055e27
        uint256 expected = baseRate + (baseSlope * utilization) / RAY;
        assertEq(rate, expected);
    }

    function test_getBorrowRate_atKink() public view {
        uint256 rate = model.getBorrowRate(kink);
        // Expected: baseRate + baseSlope * kink = 0.02e27 + 0.07e27 * 0.8 = 0.076e27
        uint256 expected = baseRate + (baseSlope * kink) / RAY;
        assertEq(rate, expected);
    }

    function test_getBorrowRate_aboveKink() public view {
        uint256 utilization = 0.90e27; // 90%
        uint256 rate = model.getBorrowRate(utilization);
        // Expected: baseRate + baseSlope * kink + jumpSlope * (utilization - kink)
        // = 0.02e27 + 0.07e27 * 0.8 + 3e27 * 0.1 = 0.02 + 0.056 + 0.3 = 0.376e27
        uint256 normalRate = baseRate + (baseSlope * kink) / RAY;
        uint256 excessUtil = utilization - kink;
        uint256 expected = normalRate + (jumpSlope * excessUtil) / RAY;
        assertEq(rate, expected);
    }

    function test_getBorrowRate_fullUtilization() public view {
        uint256 utilization = RAY; // 100%
        uint256 rate = model.getBorrowRate(utilization);
        // Expected: baseRate + baseSlope * kink + jumpSlope * (1.0 - kink)
        uint256 normalRate = baseRate + (baseSlope * kink) / RAY;
        uint256 excessUtil = RAY - kink;
        uint256 expected = normalRate + (jumpSlope * excessUtil) / RAY;
        assertEq(rate, expected);
    }

    // ============ getSupplyRate Tests ============

    function test_getSupplyRate_zeroUtilization() public view {
        uint256 rate = model.getSupplyRate(0);
        assertEq(rate, 0);
    }

    function test_getSupplyRate_belowKink() public view {
        uint256 utilization = 0.50e27;
        uint256 supplyRate = model.getSupplyRate(utilization);
        // supplyRate = borrowRate * utilization * (1 - reserveFactor) / RAY / RAY
        uint256 borrowRate = model.getBorrowRate(utilization);
        uint256 rateTimesUtil = (borrowRate * utilization) / RAY;
        uint256 expected = (rateTimesUtil * (RAY - reserveFactor)) / RAY;
        assertEq(supplyRate, expected);
    }

    function test_getSupplyRate_lessThanBorrowRate() public view {
        uint256 utilization = 0.50e27;
        uint256 supplyRate = model.getSupplyRate(utilization);
        uint256 borrowRate = model.getBorrowRate(utilization);
        // Supply rate should always be less than borrow rate (reserves + utilization < 1)
        assertLt(supplyRate, borrowRate);
    }

    // ============ getUtilization Tests ============

    function test_getUtilization_zeroBorrows() public view {
        uint256 util = model.getUtilization(0, 1000e6);
        assertEq(util, 0);
    }

    function test_getUtilization_zeroDenominator() public view {
        uint256 util = model.getUtilization(0, 0);
        assertEq(util, 0);
    }

    function test_getUtilization_halfUtilized() public view {
        // totalBorrows = 500, totalSupply (cash) = 500
        // utilization = 500 * RAY / (500 + 500) = 0.5 * RAY
        uint256 util = model.getUtilization(500e6, 500e6);
        assertEq(util, 0.5e27);
    }

    function test_getUtilization_fullyUtilized() public view {
        // totalBorrows = 1000, totalSupply (cash) = 0
        // utilization = 1000 * RAY / (0 + 1000) = RAY
        uint256 util = model.getUtilization(1000e6, 0);
        assertEq(util, RAY);
    }

    // ============ Admin Setter Tests ============

    function test_setBaseRate_success() public {
        uint256 newRate = 0.03e27;
        vm.prank(admin);
        model.setBaseRate(newRate);
        assertEq(model.baseRate(), newRate);
    }

    function test_setBaseRate_revertsNonAdmin() public {
        vm.expectRevert(Errors.Unauthorized.selector);
        vm.prank(makeAddr("attacker"));
        model.setBaseRate(0.03e27);
    }

    function test_setBaseRate_revertsExceedsMax() public {
        vm.expectRevert(Errors.InvalidParameter.selector);
        vm.prank(admin);
        model.setBaseRate(6e27); // > MAX_RATE (5e27)
    }

    function test_setBaseSlope_success() public {
        uint256 newSlope = 0.10e27;
        vm.prank(admin);
        model.setBaseSlope(newSlope);
        assertEq(model.baseSlope(), newSlope);
    }

    function test_setJumpSlope_success() public {
        uint256 newSlope = 4e27;
        vm.prank(admin);
        model.setJumpSlope(newSlope);
        assertEq(model.jumpSlope(), newSlope);
    }

    function test_setKink_success() public {
        uint256 newKink = 0.75e27;
        vm.prank(admin);
        model.setKink(newKink);
        assertEq(model.kink(), newKink);
    }

    function test_setKink_revertsOutOfBounds() public {
        vm.expectRevert(Errors.InvalidParameter.selector);
        vm.prank(admin);
        model.setKink(0.005e27); // < MIN_KINK
    }

    function test_setReserveFactor_success() public {
        uint256 newFactor = 0.20e27;
        vm.prank(admin);
        model.setReserveFactor(newFactor);
        assertEq(model.reserveFactor(), newFactor);
    }

    function test_setReserveFactor_revertsExceedsMax() public {
        vm.expectRevert(Errors.InvalidParameter.selector);
        vm.prank(admin);
        model.setReserveFactor(0.6e27); // > MAX_RESERVE_FACTOR
    }
}
