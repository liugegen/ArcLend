// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {Errors} from "../src/libraries/Errors.sol";
import {TestAggregator} from "./helpers/TestAggregator.sol";

/**
 * @title PriceOracleTest
 * @notice Comprehensive tests for the PriceOracle contract.
 */
contract PriceOracleTest is Test {
    PriceOracle public oracle;
    TestAggregator public usycFeed;
    TestAggregator public usdcFeed;

    address public owner;
    address public usyc = makeAddr("USYC");
    address public usdc = makeAddr("USDC");

    function setUp() public {
        owner = makeAddr("owner");

        vm.startPrank(owner);
        oracle = new PriceOracle(owner);

        // Deploy test aggregators (8 decimals, initial prices)
        usycFeed = new TestAggregator(8, 1.02e8); // USYC = $1.02
        usdcFeed = new TestAggregator(8, 1e8); // USDC = $1.00

        // Configure feeds
        oracle.setAssetFeed(usyc, address(usycFeed));
        oracle.setAssetFeed(usdc, address(usdcFeed));
        vm.stopPrank();
    }

    // ============ Constructor Tests ============

    function test_constructor_setsOwner() public view {
        assertEq(oracle.owner(), owner);
    }

    function test_constructor_revertsZeroAddress() public {
        vm.expectRevert(Errors.InvalidParameter.selector);
        new PriceOracle(address(0));
    }

    // ============ getAssetPrice Tests ============

    function test_getAssetPrice_returnsCorrectPrice() public view {
        uint256 price = oracle.getAssetPrice(usyc);
        assertEq(price, 1.02e8);
    }

    function test_getAssetPrice_revertsNoFeed() public {
        address unknown = makeAddr("unknown");
        vm.expectRevert(Errors.InvalidParameter.selector);
        oracle.getAssetPrice(unknown);
    }

    function test_getAssetPrice_revertsStalePrice() public {
        // Warp to a reasonable timestamp first, then make the feed stale (> 30 days)
        vm.warp(100_000 + 31 days);
        usycFeed.setUpdatedAt(block.timestamp - 31 days);

        vm.expectRevert(Errors.StaleOraclePrice.selector);
        oracle.getAssetPrice(usyc);
    }

    function test_getAssetPrice_revertsNegativePrice() public {
        usycFeed.setAnswer(-1);

        vm.expectRevert(Errors.InvalidParameter.selector);
        oracle.getAssetPrice(usyc);
    }

    function test_getAssetPrice_revertsZeroPrice() public {
        usycFeed.setAnswer(0);

        vm.expectRevert(Errors.InvalidParameter.selector);
        oracle.getAssetPrice(usyc);
    }

    function test_getAssetPrice_normalizesLowerDecimals() public {
        // Deploy a 6-decimal feed
        TestAggregator feed6 = new TestAggregator(6, 1.02e6);
        vm.prank(owner);
        oracle.setAssetFeed(usyc, address(feed6));

        uint256 price = oracle.getAssetPrice(usyc);
        // Should normalize to 8 decimals: 1.02e6 * 10^(8-6) = 1.02e8
        assertEq(price, 1.02e8);
    }

    function test_getAssetPrice_normalizesHigherDecimals() public {
        // Deploy a 18-decimal feed
        TestAggregator feed18 = new TestAggregator(18, 1.02e18);
        vm.prank(owner);
        oracle.setAssetFeed(usyc, address(feed18));

        uint256 price = oracle.getAssetPrice(usyc);
        // Should normalize to 8 decimals: 1.02e18 / 10^(18-8) = 1.02e8
        assertEq(price, 1.02e8);
    }

    // ============ isFeedFresh Tests ============

    function test_isFeedFresh_returnsTrue() public view {
        assertTrue(oracle.isFeedFresh(usyc));
    }

    function test_isFeedFresh_returnsFalseWhenStale() public {
        vm.warp(100_000 + 31 days);
        usycFeed.setUpdatedAt(block.timestamp - 31 days);
        assertFalse(oracle.isFeedFresh(usyc));
    }

    function test_isFeedFresh_returnsFalseNoFeed() public view {
        address unknown = address(0xdead);
        assertFalse(oracle.isFeedFresh(unknown));
    }

    function test_isFeedFresh_exactThreshold() public {
        // Exactly at 30 days should still be fresh (<=)
        vm.warp(100_000 + 30 days);
        usycFeed.setUpdatedAt(block.timestamp - 30 days);
        assertTrue(oracle.isFeedFresh(usyc));
    }

    // ============ setAssetFeed Tests ============

    function test_setAssetFeed_success() public {
        address newAsset = makeAddr("newAsset");
        TestAggregator newFeed = new TestAggregator(8, 5e8);

        vm.prank(owner);
        oracle.setAssetFeed(newAsset, address(newFeed));

        assertEq(oracle.assetFeeds(newAsset), address(newFeed));
    }

    function test_setAssetFeed_revertsNonOwner() public {
        vm.expectRevert(Errors.Unauthorized.selector);
        vm.prank(makeAddr("attacker"));
        oracle.setAssetFeed(usyc, address(usycFeed));
    }

    function test_setAssetFeed_revertsZeroAsset() public {
        vm.expectRevert(Errors.InvalidParameter.selector);
        vm.prank(owner);
        oracle.setAssetFeed(address(0), address(usycFeed));
    }

    function test_setAssetFeed_revertsZeroFeed() public {
        vm.expectRevert(Errors.InvalidParameter.selector);
        vm.prank(owner);
        oracle.setAssetFeed(usyc, address(0));
    }

    // ============ transferOwnership Tests ============

    function test_transferOwnership_success() public {
        address newOwner = makeAddr("newOwner");
        vm.prank(owner);
        oracle.transferOwnership(newOwner);
        assertEq(oracle.owner(), newOwner);
    }

    function test_transferOwnership_revertsNonOwner() public {
        vm.expectRevert(Errors.Unauthorized.selector);
        vm.prank(makeAddr("attacker"));
        oracle.transferOwnership(makeAddr("newOwner"));
    }

    function test_transferOwnership_revertsZeroAddress() public {
        vm.expectRevert(Errors.InvalidParameter.selector);
        vm.prank(owner);
        oracle.transferOwnership(address(0));
    }
}
