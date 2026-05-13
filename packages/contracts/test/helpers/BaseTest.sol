// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "./IERC20.sol";
import {TestAggregator} from "./TestAggregator.sol";

/**
 * @title BaseTest
 * @notice Common test setup for ArcLend protocol tests running against an Arc testnet fork.
 *
 * @dev All tests run against a fork of Arc L1 Testnet (chain ID 5042002).
 *      Real token contracts are used — no mocks. Test accounts are funded via
 *      Foundry's `deal` cheatcode which manipulates storage on the forked state.
 *
 *      Arc Testnet contract addresses:
 *        USDC: 0x3600000000000000000000000000000000000000 (6 decimals, native ERC-20)
 *        EURC: 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a (6 decimals)
 *        USYC: 0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C (6 decimals)
 */
abstract contract BaseTest is Test {
    // ─── Real Token Addresses (Arc Testnet) ─────────────────────────────────────
    address public constant USDC_ADDRESS = 0x3600000000000000000000000000000000000000;
    address public constant EURC_ADDRESS = 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a;
    address public constant USYC_ADDRESS = 0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C;

    // ─── Token Interfaces (real contracts on Arc testnet) ────────────────────────
    IERC20 public usdc = IERC20(USDC_ADDRESS);
    IERC20 public eurc = IERC20(EURC_ADDRESS);
    IERC20 public usyc = IERC20(USYC_ADDRESS);

    // ─── Test Oracle (deployed to fork during setup) ────────────────────────────
    TestAggregator public usycPriceFeed;

    // ─── Test Accounts ──────────────────────────────────────────────────────────
    address public admin;
    address public alice;
    address public bob;
    address public carol;
    address public liquidator;

    // ─── Constants ──────────────────────────────────────────────────────────────
    uint256 public constant RAY = 1e27;
    uint256 public constant USDC_DECIMALS = 6;
    uint256 public constant EURC_DECIMALS = 6;
    uint256 public constant USYC_DECIMALS = 6;
    uint256 public constant ORACLE_DECIMALS = 8;

    // Arc Testnet chain ID
    uint256 public constant ARC_TESTNET_CHAIN_ID = 5042002;

    // Common test amounts (in token units with decimals)
    uint256 public constant INITIAL_BALANCE = 1_000_000e6; // 1M tokens (6 decimals)
    uint256 public constant DEPOSIT_AMOUNT = 10_000e6; // 10K tokens (6 decimals)
    uint256 public constant BORROW_AMOUNT = 5_000e6; // 5K tokens (6 decimals)
    uint256 public constant COLLATERAL_AMOUNT = 20_000e6; // 20K USYC (6 decimals on Arc)
    uint256 public constant INITIAL_USYC_BALANCE = 1_000_000e6; // 1M USYC (6 decimals)

    // Oracle price constants (8 decimals)
    uint256 public constant USDC_PRICE = 1e8; // $1.00
    uint256 public constant EURC_PRICE = 1.08e8; // $1.08
    uint256 public constant USYC_PRICE = 1.02e8; // $1.02 (NAV with yield)

    // Fork URL for Arc Testnet
    string public constant ARC_TESTNET_RPC = "https://rpc.testnet.arc.network";

    function setUp() public virtual {
        // Create a fork of Arc Testnet
        vm.createSelectFork(ARC_TESTNET_RPC);

        _createAccounts();
        _fundAccounts();
        _deployTestOracle();
        _labelAddresses();
    }

    // ─── Internal Setup Helpers ─────────────────────────────────────────────────

    function _createAccounts() internal {
        admin = makeAddr("admin");
        alice = makeAddr("alice");
        bob = makeAddr("bob");
        carol = makeAddr("carol");
        liquidator = makeAddr("liquidator");
    }

    /**
     * @notice Fund test accounts with real tokens using Foundry's `deal` cheatcode.
     * @dev `deal` directly manipulates the token contract's storage on the fork,
     *      giving test accounts balances without needing a faucet or minting permissions.
     */
    function _fundAccounts() internal {
        // Fund USDC balances
        deal(USDC_ADDRESS, alice, INITIAL_BALANCE);
        deal(USDC_ADDRESS, bob, INITIAL_BALANCE);
        deal(USDC_ADDRESS, carol, INITIAL_BALANCE);
        deal(USDC_ADDRESS, liquidator, INITIAL_BALANCE);

        // Fund EURC balances
        deal(EURC_ADDRESS, alice, INITIAL_BALANCE);
        deal(EURC_ADDRESS, bob, INITIAL_BALANCE);
        deal(EURC_ADDRESS, carol, INITIAL_BALANCE);

        // Fund USYC (collateral) balances
        deal(USYC_ADDRESS, alice, INITIAL_USYC_BALANCE);
        deal(USYC_ADDRESS, bob, INITIAL_USYC_BALANCE);
        deal(USYC_ADDRESS, carol, INITIAL_USYC_BALANCE);
    }

    /**
     * @notice Deploy a TestAggregator to the forked state for oracle price testing.
     * @dev This is a real contract deployed to the fork — not a mock.
     *      It implements the full Chainlink AggregatorV3 interface and allows
     *      tests to control the USYC/USD price feed.
     */
    function _deployTestOracle() internal {
        vm.prank(admin);
        usycPriceFeed = new TestAggregator(8, int256(USYC_PRICE));
    }

    function _labelAddresses() internal {
        vm.label(USDC_ADDRESS, "USDC");
        vm.label(EURC_ADDRESS, "EURC");
        vm.label(USYC_ADDRESS, "USYC");
        vm.label(address(usycPriceFeed), "USYC_PriceFeed");
        vm.label(admin, "Admin");
        vm.label(alice, "Alice");
        vm.label(bob, "Bob");
        vm.label(carol, "Carol");
        vm.label(liquidator, "Liquidator");
    }

    // ─── Utility Helpers ────────────────────────────────────────────────────────

    /**
     * @notice Helper to approve a spender for a given token.
     * @param token The ERC-20 token to approve.
     * @param spender The address to approve spending.
     * @param user The user performing the approval.
     * @param amount The amount to approve.
     */
    function _approveToken(IERC20 token, address spender, address user, uint256 amount) internal {
        vm.prank(user);
        token.approve(spender, amount);
    }

    /**
     * @notice Convert a percentage (e.g., 80) to ray representation.
     * @param pct The percentage value (0-100).
     * @return The value in ray (1e27 precision).
     */
    function _pctToRay(uint256 pct) internal pure returns (uint256) {
        return (pct * RAY) / 100;
    }

    /**
     * @notice Advance the block number by a given count.
     * @param blocks The number of blocks to advance.
     */
    function _advanceBlocks(uint256 blocks) internal {
        vm.roll(block.number + blocks);
        vm.warp(block.timestamp + blocks * 12); // ~12s per block
    }

    /**
     * @notice Set the USYC oracle price for testing.
     * @param price The new price in 8-decimal format.
     */
    function _setUsycPrice(uint256 price) internal {
        usycPriceFeed.setAnswer(int256(price));
    }

    /**
     * @notice Make the USYC oracle stale for testing staleness checks.
     * @param secondsStale How many seconds in the past to set the update time.
     */
    function _makeOracleStale(uint256 secondsStale) internal {
        usycPriceFeed.setUpdatedAt(block.timestamp - secondsStale);
    }
}
