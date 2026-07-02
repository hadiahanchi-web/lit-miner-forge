// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title RiskEngine — soft anti-bot / anti-whale scoring.
/// @notice The Core updates a score per address on each mutating action.
///         When the score meets or exceeds `maxScore`, `isBlocked` returns
///         true and the Core rejects the user's claim.
contract RiskEngine is Ownable {
    mapping(address => uint256) public score;
    mapping(address => uint256) public lastActionAt;

    uint256 public maxScore = 100;
    uint256 public powerHigh = 1000 ether;
    uint256 public powerMid  = 100 ether;
    uint256 public frequencyHigh = 10;

    uint256 public powerScoreHigh = 40;
    uint256 public powerScoreMid  = 20;
    uint256 public freqScoreHigh  = 30;

    address public core;
    bool public coreLocked;

    event ScoreUpdated(address indexed user, uint256 score, uint256 power, uint256 frequency);
    event ThresholdsUpdated();
    event CoreUpdated(address indexed newCore);
    event CoreLocked();

    error NotCore();
    error CoreAlreadyLocked();
    error ZeroAddress();

    modifier onlyCore() {
        if (msg.sender != core) revert NotCore();
        _;
    }

    constructor() Ownable(msg.sender) {}

    function setCore(address newCore) external onlyOwner {
        if (coreLocked) revert CoreAlreadyLocked();
        if (newCore == address(0)) revert ZeroAddress();
        core = newCore;
        emit CoreUpdated(newCore);
    }

    function lockCore() external onlyOwner {
        if (coreLocked) revert CoreAlreadyLocked();
        coreLocked = true;
        emit CoreLocked();
    }

    function setMaxScore(uint256 v) external onlyOwner {
        maxScore = v;
        emit ThresholdsUpdated();
    }

    function setPowerThresholds(uint256 high, uint256 mid, uint256 scoreHigh, uint256 scoreMid) external onlyOwner {
        powerHigh = high;
        powerMid = mid;
        powerScoreHigh = scoreHigh;
        powerScoreMid = scoreMid;
        emit ThresholdsUpdated();
    }

    function setFrequencyThresholds(uint256 freqHigh, uint256 scoreHigh) external onlyOwner {
        frequencyHigh = freqHigh;
        freqScoreHigh = scoreHigh;
        emit ThresholdsUpdated();
    }

    function updateScore(address user, uint256 power, uint256 frequency) external onlyCore {
        uint256 s = 0;
        if (power > powerHigh) s += powerScoreHigh;
        else if (power > powerMid) s += powerScoreMid;

        if (frequency > frequencyHigh) s += freqScoreHigh;

        score[user] = s;
        lastActionAt[user] = block.timestamp;
        emit ScoreUpdated(user, s, power, frequency);
    }

    function isBlocked(address user) external view returns (bool) {
        return score[user] >= maxScore;
    }
}
