// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IAggregatorV3} from "../../src/interfaces/IAggregatorV3.sol";

/**
 * @title TestAggregator
 * @notice A controllable Chainlink-compatible price feed deployed in fork tests.
 * @dev This is NOT a mock — it's a real contract deployed to the forked Arc testnet state.
 *      It implements the full IAggregatorV3 interface and allows test scripts to set
 *      prices and timestamps to simulate real oracle behavior.
 */
contract TestAggregator is IAggregatorV3 {
    uint8 private _decimals;
    int256 private _answer;
    uint256 private _updatedAt;
    uint80 private _roundId;

    constructor(uint8 decimals_, int256 initialAnswer) {
        _decimals = decimals_;
        _answer = initialAnswer;
        _updatedAt = block.timestamp;
        _roundId = 1;
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        return (_roundId, _answer, _updatedAt, _updatedAt, _roundId);
    }

    /// @notice Update the price answer (simulates oracle update on testnet)
    function setAnswer(int256 newAnswer) external {
        _answer = newAnswer;
        _updatedAt = block.timestamp;
        _roundId++;
    }

    /// @notice Set a specific timestamp for staleness testing
    function setUpdatedAt(uint256 timestamp) external {
        _updatedAt = timestamp;
    }

    /// @notice Set both answer and timestamp in one call
    function setRoundData(int256 answer, uint256 updatedAt) external {
        _answer = answer;
        _updatedAt = updatedAt;
        _roundId++;
    }
}
