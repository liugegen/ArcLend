// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPriceOracle
 * @notice Interface for the price oracle providing USD-denominated price feeds.
 * Uses a Chainlink-compatible pattern with staleness checks.
 */
interface IPriceOracle {
    /**
     * @notice Get the USD price of an asset with 8 decimal places of precision.
     * @param asset The address of the asset to price.
     * @return The asset price in USD with 8 decimals (e.g., 1e8 = $1.00).
     */
    function getAssetPrice(address asset) external view returns (uint256);

    /**
     * @notice Check if the price feed for an asset is fresh (updated within 24 hours).
     * @param asset The address of the asset to check.
     * @return True if the feed has been updated within the last 24 hours, false otherwise.
     */
    function isFeedFresh(address asset) external view returns (bool);

    /**
     * @notice Set the price feed source for an asset. Admin-only.
     * @param asset The address of the asset.
     * @param feed The address of the Chainlink-compatible price feed.
     */
    function setAssetFeed(address asset, address feed) external;
}
