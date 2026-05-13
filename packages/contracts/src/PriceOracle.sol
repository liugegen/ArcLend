// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPriceOracle} from "./interfaces/IPriceOracle.sol";
import {IAggregatorV3} from "./interfaces/IAggregatorV3.sol";
import {Errors} from "./libraries/Errors.sol";

/**
 * @title PriceOracle
 * @notice Provides USD-denominated price feeds for ArcLend protocol assets.
 * @dev Uses Chainlink-compatible AggregatorV3 feeds with a 24-hour staleness threshold.
 *      Prices are returned with 8 decimal places of precision.
 */
contract PriceOracle is IPriceOracle {
    /// @notice The staleness threshold for price feeds (24 hours).
    uint256 public constant STALENESS_THRESHOLD = 24 hours;

    /// @notice The expected price precision (8 decimals).
    uint8 public constant PRICE_DECIMALS = 8;

    /// @notice The protocol administrator address.
    address public owner;

    /// @notice Mapping of asset address to its Chainlink-compatible price feed address.
    mapping(address => address) public assetFeeds;

    /// @notice Emitted when a price feed is configured for an asset.
    /// @param asset The asset address.
    /// @param feed The price feed address.
    event AssetFeedUpdated(address indexed asset, address indexed feed);

    /// @notice Emitted when ownership is transferred.
    /// @param previousOwner The previous owner address.
    /// @param newOwner The new owner address.
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /// @dev Restricts function access to the contract owner.
    modifier onlyOwner() {
        if (msg.sender != owner) {
            revert Errors.Unauthorized();
        }
        _;
    }

    /**
     * @notice Initializes the PriceOracle with the given admin address.
     * @param _owner The address of the protocol administrator.
     */
    constructor(address _owner) {
        if (_owner == address(0)) {
            revert Errors.InvalidParameter();
        }
        owner = _owner;
        emit OwnershipTransferred(address(0), _owner);
    }

    /**
     * @inheritdoc IPriceOracle
     * @dev Reads the latest price from the configured Chainlink-compatible feed.
     *      Reverts with StaleOraclePrice if the feed has not been updated within 24 hours.
     *      Reverts with InvalidParameter if no feed is configured for the asset.
     *      Normalizes the price to 8 decimal precision regardless of the feed's native decimals.
     */
    function getAssetPrice(address asset) external view override returns (uint256) {
        address feed = assetFeeds[asset];
        if (feed == address(0)) {
            revert Errors.InvalidParameter();
        }

        (
            ,
            int256 answer,
            ,
            uint256 updatedAt,
        ) = IAggregatorV3(feed).latestRoundData();

        // Check staleness
        if (block.timestamp - updatedAt > STALENESS_THRESHOLD) {
            revert Errors.StaleOraclePrice();
        }

        // Ensure price is positive
        if (answer <= 0) {
            revert Errors.InvalidParameter();
        }

        // Normalize to 8 decimals
        uint8 feedDecimals = IAggregatorV3(feed).decimals();
        if (feedDecimals == PRICE_DECIMALS) {
            return uint256(answer);
        } else if (feedDecimals < PRICE_DECIMALS) {
            return uint256(answer) * (10 ** (PRICE_DECIMALS - feedDecimals));
        } else {
            return uint256(answer) / (10 ** (feedDecimals - PRICE_DECIMALS));
        }
    }

    /**
     * @inheritdoc IPriceOracle
     * @dev Returns true if the feed's last update was within the 24-hour staleness threshold.
     *      Returns false if no feed is configured or the feed is stale.
     */
    function isFeedFresh(address asset) external view override returns (bool) {
        address feed = assetFeeds[asset];
        if (feed == address(0)) {
            return false;
        }

        (
            ,
            ,
            ,
            uint256 updatedAt,
        ) = IAggregatorV3(feed).latestRoundData();

        return (block.timestamp - updatedAt) <= STALENESS_THRESHOLD;
    }

    /**
     * @inheritdoc IPriceOracle
     * @dev Configures the price feed source for an asset. Only callable by the owner.
     *      The feed address must not be zero.
     */
    function setAssetFeed(address asset, address feed) external override onlyOwner {
        if (asset == address(0) || feed == address(0)) {
            revert Errors.InvalidParameter();
        }
        assetFeeds[asset] = feed;
        emit AssetFeedUpdated(asset, feed);
    }

    /**
     * @notice Transfers ownership of the contract to a new address.
     * @param newOwner The address of the new owner.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) {
            revert Errors.InvalidParameter();
        }
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }
}
