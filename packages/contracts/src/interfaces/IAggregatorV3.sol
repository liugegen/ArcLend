// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IAggregatorV3
 * @notice Minimal Chainlink AggregatorV3Interface for price feed reading.
 * @dev Only includes latestRoundData() which is used by the PriceOracle.
 */
interface IAggregatorV3 {
    /**
     * @notice Returns the latest round data from the price feed.
     * @return roundId The round ID.
     * @return answer The price answer (with feed-specific decimals).
     * @return startedAt Timestamp when the round started.
     * @return updatedAt Timestamp when the round was last updated.
     * @return answeredInRound The round ID in which the answer was computed.
     */
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    /**
     * @notice Returns the number of decimals the feed uses.
     * @return The number of decimals.
     */
    function decimals() external view returns (uint8);
}
