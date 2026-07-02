// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title TreasuryVault — segmented native (zkLTC) treasury.
/// @notice Splits every deposit into reserve / dev / reward. Only the Core
///         (mining contract) can consume from the reward pool. Only the owner
///         can withdraw the dev pool.
contract TreasuryVault is Ownable, ReentrancyGuard {
    uint256 public rewardPool;   // liquidity backing claims
    uint256 public reservePool;  // long-term safety buffer
    uint256 public devPool;      // owner-controlled ops/marketing

    uint256 public reserveBps = 1000; // 10%
    uint256 public devBps = 1000;     // 10%
    uint256 public constant BPS = 10000;

    address public core;
    bool public coreLocked;

    event Deposited(address indexed from, uint256 amount, uint256 toReserve, uint256 toDev, uint256 toReward);
    event Consumed(address indexed to, uint256 amount);
    event DevWithdrawn(address indexed to, uint256 amount);
    event CoreUpdated(address indexed newCore);
    event CoreLocked();
    event SplitsUpdated(uint256 reserveBps, uint256 devBps);

    error NotCore();
    error CoreAlreadyLocked();
    error ZeroAddress();
    error InsufficientReward();
    error InsufficientDev();
    error SplitTooHigh();
    error TransferFailed();

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

    function setSplits(uint256 _reserveBps, uint256 _devBps) external onlyOwner {
        if (_reserveBps + _devBps > 5000) revert SplitTooHigh(); // hard cap 50%
        reserveBps = _reserveBps;
        devBps = _devBps;
        emit SplitsUpdated(_reserveBps, _devBps);
    }

    function deposit() external payable {
        _deposit(msg.sender, msg.value);
    }

    receive() external payable {
        _deposit(msg.sender, msg.value);
    }

    function _deposit(address from, uint256 amount) internal {
        uint256 toReserve = (amount * reserveBps) / BPS;
        uint256 toDev = (amount * devBps) / BPS;
        uint256 toReward = amount - toReserve - toDev;

        reservePool += toReserve;
        devPool += toDev;
        rewardPool += toReward;

        emit Deposited(from, amount, toReserve, toDev, toReward);
    }

    function availableRewards() public view returns (uint256) {
        return rewardPool;
    }

    /// @notice Called by Core to lock native backing for a mint of LFR.
    ///         Amount is booked out of rewardPool but stays custodial in the
    ///         vault until a redeem/withdraw mechanism sends it out.
    function consume(uint256 amount) external onlyCore {
        if (amount > rewardPool) revert InsufficientReward();
        rewardPool -= amount;
        emit Consumed(msg.sender, amount);
    }

    function withdrawDev(address to, uint256 amount) external onlyOwner nonReentrant {
        if (amount > devPool) revert InsufficientDev();
        if (to == address(0)) revert ZeroAddress();
        devPool -= amount;
        (bool ok, ) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit DevWithdrawn(to, amount);
    }
}
