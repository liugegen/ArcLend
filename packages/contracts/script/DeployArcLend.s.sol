// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Script, console} from "forge-std/Script.sol";
import {PriceOracle} from "../src/PriceOracle.sol";
import {InterestRateModel} from "../src/InterestRateModel.sol";
import {ArcLendVault} from "../src/ArcLendVault.sol";

/**
 * @title DeployArcLend
 * @notice Deployment script for ArcLend v2 (auto-collateral model) on Arc Testnet.
 * @dev Deploys PriceOracle → InterestRateModel → ArcLendVault.
 *      No separate collateral asset required — supplied assets ARE collateral.
 *
 * Required env vars:
 *   PRIVATE_KEY          - Deployer private key
 *   DEPLOYER_ADDRESS     - Deployer/admin address
 *   USDC_ADDRESS         - USDC token address on Arc Testnet
 *   EURC_ADDRESS         - EURC token address on Arc Testnet
 */
contract DeployArcLend is Script {
    // ============ Interest Rate Model Defaults (ray = 1e27) ============
    uint256 constant BASE_RATE = 0.02e27;       // 2% base
    uint256 constant BASE_SLOPE = 0.04e27;      // 4% slope below kink
    uint256 constant JUMP_SLOPE = 0.75e27;      // 75% slope above kink
    uint256 constant KINK = 0.80e27;            // 80% utilization kink
    uint256 constant RESERVE_FACTOR = 0.10e27;  // 10% to protocol

    // ============ Collateral Config ============
    uint256 constant COLLATERAL_FACTOR = 0.80e27;       // 80% LTV
    uint256 constant LIQUIDATION_INCENTIVE = 0.05e27;   // 5% bonus

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.envAddress("DEPLOYER_ADDRESS");
        address usdc = vm.envAddress("USDC_ADDRESS");
        address eurc = vm.envAddress("EURC_ADDRESS");

        console.log("=== ArcLend v2 Deployment (Auto-Collateral) ===");
        console.log("Deployer:", deployer);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy PriceOracle
        PriceOracle priceOracle = new PriceOracle(deployer);
        console.log("PriceOracle:", address(priceOracle));

        // Set price feeds for USDC and EURC (stablecoins at $1)
        // For MVP, the oracle returns 1e8 for both (configured externally)

        // 2. Deploy InterestRateModel
        InterestRateModel interestRateModel = new InterestRateModel(
            deployer,
            BASE_RATE,
            BASE_SLOPE,
            JUMP_SLOPE,
            KINK,
            RESERVE_FACTOR
        );
        console.log("InterestRateModel:", address(interestRateModel));

        // 3. Deploy ArcLendVault (auto-collateral model)
        address[] memory supportedAssets = new address[](2);
        supportedAssets[0] = usdc;
        supportedAssets[1] = eurc;

        ArcLendVault vault = new ArcLendVault(
            deployer,
            address(interestRateModel),
            address(priceOracle),
            supportedAssets,
            COLLATERAL_FACTOR,
            LIQUIDATION_INCENTIVE
        );
        console.log("ArcLendVault:", address(vault));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("PriceOracle:       ", address(priceOracle));
        console.log("InterestRateModel: ", address(interestRateModel));
        console.log("ArcLendVault:      ", address(vault));
        console.log("USDC:              ", usdc);
        console.log("EURC:              ", eurc);
        console.log("Collateral Factor:  80%");
        console.log("Liquidation Bonus:  5%");
        console.log("===========================");
    }
}
