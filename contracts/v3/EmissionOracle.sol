// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title EmissionOracle — dynamic bps emission curve.
/// @notice Emission scales down as TVL grows toward `capTVL` and applies
///         extra pressure once active users cross a threshold.
///         Returns basis points (10000 = 1x).
contract EmissionOracle is Ownable {
    uint256 public tvl;
    uint256 public activeUsers;

    uint256 public base = 10000;   // 1x
    uint256 public min = 300;      // 0.03x
    uint256 public capTVL = 500 ether;

    uint256 public userPressureAt = 1000;
    uint256 public userPressureBps = 8000; // multiply by 80% when triggered

    address public core;
    bool public coreLocked;

    event TVLUpdated(uint256 tvl);
    event UsersUpdated(uint256 users);
    event ParamsUpdated();
    event CoreUpdated(address indexed newCore);
    event CoreLocked();

    error NotCore();
    error CoreAlreadyLocked();
    error ZeroAddress();
    error InvalidRange();

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

    function setCurve(uint256 _base, uint256 _min, uint256 _capTVL) external onlyOwner {
        if (_min > _base || _base > 10000 || _capTVL == 0) revert InvalidRange();
        base = _base;
        min = _min;
        capTVL = _capTVL;
        emit ParamsUpdated();
    }

    function setUserPressure(uint256 at, uint256 bps) external onlyOwner {
        if (bps > 10000) revert InvalidRange();
        userPressureAt = at;
        userPressureBps = bps;
        emit ParamsUpdated();
    }

    function updateTVL(uint256 _tvl) external onlyCore {
        tvl = _tvl;
        emit TVLUpdated(_tvl);
    }

    function updateUsers(uint256 u) external onlyCore {
        activeUsers = u;
        emit UsersUpdated(u);
    }

    function getEmission() public view returns (uint256) {
        uint256 tvlFactor;
        if (tvl >= capTVL) {
            tvlFactor = min;
        } else {
            tvlFactor = base - ((tvl * (base - min)) / capTVL);
        }
        if (activeUsers > userPressureAt) {
            tvlFactor = (tvlFactor * userPressureBps) / 10000;
        }
        if (tvlFactor < min) tvlFactor = min;
        return tvlFactor;
    }
}
