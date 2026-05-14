// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {ArcLendVault} from "../src/ArcLendVault.sol";
import {DataTypes} from "../src/libraries/DataTypes.sol";

/**
 * @title DeployArcLend
 * @notice Production deployment script for the ArcLend protocol on Arc Testnet.
 * @dev Deploys PriceOracle → InterestRateModel → ArcLendVault in dependency order
 *      and wires them together. All config values are read from environment variables.
 *
 * Required env vars:
 *   PRIVATE_KEY          - Deployer private key
 *   DEPLOYER_ADDRESS     - Deployer/admin address
 *   USDC_ADDRESS         - USDC token address on Arc Testnet
 *   EURC_ADDRESS         - EURC token address on Arc Testnet
 *   USYC_ADDRESS         - USYC (collateral) token address on Arc Testnet
 *   USYC_PRICE_FEED      - Chainlink-compatible price feed for USYC
 */
contract DeployArcLend is Script {
    // ============ Interest Rate Model Defaults (ray = 1e27) ============
    // Base rate: 2% annualized
    uint256 constant BASE_RATE = 0.02e27;
    // Base slope: 4% (rate at kink = 2% + 4%*80% = 5.2%)
    uint256 constant BASE_SLOPE = 0.04e27;
    // Jump slope: 75% (steep increase above kink)
    uint256 constant JUMP_SLOPE = 0.75e27;
    // Kink: 80% utilization
    uint256 constant KINK = 0.80e27;
    // Reserve factor: 10% of interest goes to protocol
    uint256 constant RESERVE_FACTOR = 0.10e27;

    // ============ Collateral Config Defaults ============
    // Collateral factor: 80% LTV
    uint256 constant COLLATERAL_FACTOR = 0.80e27;
    // Liquidation incentive: 5%
    uint256 constant LIQUIDATION_INCENTIVE = 0.05e27;

    function run() external {
        // --- Load environment variables ---
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address eurc = vm.envAddress("EURC_ADDRESS");
        address usyc = vm.envAddress("USYC_ADDRESS");
        address usycPriceFeed = vm.envAddress("USYC_PRICE_FEED");

        console.log("=== ArcLend Deployment ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        // --- 1. Deploy PriceOracle ---
        PriceOracle priceOracle = new PriceOracle(deployer);
        console.log("PriceOracle deployed at:", address(priceOracle));

        // Configure USYC price feed on the oracle
        priceOracle.setAssetFeed(usyc, usycPriceFeed);
        console.log("  -> USYC price feed set:", usycPriceFeed);

        // --- 2. Deploy InterestRateModel ---
        InterestRateModel interestRateModel = new InterestRateModel(
            deployer, // admin (will transfer to vault later if needed)
            BASE_RATE,
            BASE_SLOPE,
            JUMP_SLOPE,
            KINK,
            RESERVE_FACTOR
        );
        console.log("InterestRateModel deployed at:", address(interestRateModel));

        // --- 3. Deploy ArcLendVault ---
        address[] memory supportedAssets = new address[](2);
        supportedAssets[0] = usdc;
        supportedAssets[1] = eurc;

        DataTypes.CollateralConfig memory collateralConfig = DataTypes.CollateralConfig({
            collateralFactor: COLLATERAL_FACTOR,
            liquidationIncentive: LIQUIDATION_INCENTIVE,
            priceFeed: usycPriceFeed,
            isActive: true
        });

        ArcLendVault vault = new ArcLendVault(
            deployer,
            address(interestRateModel),
            address(priceOracle),
            supportedAssets,
            usyc,
            collateralConfig
        );
        console.log("ArcLendVault deployed at:", address(vault));

        vm.stopBroadcast();

        // --- Summary ---
        console.log("");
        console.log("=== Deployment Summary ===");
        console.log("PriceOracle:       ", address(priceOracle));
        console.log("InterestRateModel: ", address(interestRateModel));
        console.log("ArcLendVault:      ", address(vault));
        console.log("Supported assets:   USDC(%s), EURC(%s)", usdc, eurc);
        console.log("Collateral (USYC): ", usyc);
        console.log("==========================");
    }
}
