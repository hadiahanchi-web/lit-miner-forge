// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MiningManager — LiteMiner protocol for LitVM LiteForge (chain 4441)
/// @notice Players buy on-chain miners with zkLTC. Each purchase splits into
///         the reward pool (default 80%) and treasury (default 20%). Rewards
///         accrue continuously and can be claimed once >= WITHDRAW_THRESHOLD.
contract MiningManager {
    // ---------- Types ----------
    struct MinerType {
        uint256 price;         // wei
        uint256 ratePerSecond; // wei per second per unit
        bool    active;
    }

    struct Player {
        bool     registered;
        uint256  totalInvested;
        uint256  lifetimeRewards;
        uint256  lastUpdate;
        uint256  pending;
        uint256  ratePerSecond;
        uint256[] minerCounts;
    }

    // ---------- Storage ----------
    address public owner;
    bool public miningPaused;
    bool public withdrawPaused;

    // Pool accounting (wei)
    uint256 public rewardPool;
    uint256 public treasury;
    uint256 public totalDeposits;
    uint256 public totalDistributed;

    uint256 public rewardBps = 8000;   // 80%
    uint256 public treasuryBps = 2000; // 20%
    uint256 public constant WITHDRAW_THRESHOLD = 10 ether; // 10 zkLTC

    MinerType[] public miners;
    mapping(address => Player) private _players;
    address[] public playerList;

    // ---------- Events ----------
    event PlayerRegistered(address indexed player);
    event MinerPurchased(address indexed player, uint256 indexed minerType, uint256 price);
    event RewardsClaimed(address indexed player, uint256 amount);
    event PoolUpdated(uint256 rewardPool, uint256 treasury, uint256 totalDeposits, uint256 totalDistributed);
    event MinerAdded(uint256 indexed id, uint256 price, uint256 ratePerSecond);
    event MinerUpdated(uint256 indexed id, uint256 price, uint256 ratePerSecond, bool active);
    event SplitUpdated(uint256 rewardBps, uint256 treasuryBps);
    event PausedSet(bool mining, bool withdraw);

    // ---------- Modifiers ----------
    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

    constructor() {
        owner = msg.sender;
        // Starter Miner: 1 zkLTC, 0.01 zkLTC/day = 0.01e18 / 86400
        _addMiner(1 ether, uint256(1e16) / 86400);
    }

    // ---------- Owner ----------
    function _addMiner(uint256 price, uint256 ratePerSecond) internal {
        miners.push(MinerType({price: price, ratePerSecond: ratePerSecond, active: true}));
        emit MinerAdded(miners.length - 1, price, ratePerSecond);
    }
    function addMiner(uint256 price, uint256 ratePerSecond) external onlyOwner {
        _addMiner(price, ratePerSecond);
    }
    function updateMiner(uint256 id, uint256 price, uint256 ratePerSecond, bool active) external onlyOwner {
        require(id < miners.length, "bad id");
        miners[id] = MinerType({price: price, ratePerSecond: ratePerSecond, active: active});
        emit MinerUpdated(id, price, ratePerSecond, active);
    }
    function setSplit(uint256 _rewardBps, uint256 _treasuryBps) external onlyOwner {
        require(_rewardBps + _treasuryBps == 10_000, "must sum to 100%");
        rewardBps = _rewardBps;
        treasuryBps = _treasuryBps;
        emit SplitUpdated(_rewardBps, _treasuryBps);
    }
    function setPaused(bool _mining, bool _withdraw) external onlyOwner {
        miningPaused = _mining;
        withdrawPaused = _withdraw;
        emit PausedSet(_mining, _withdraw);
    }
    function withdrawTreasury(address to, uint256 amount) external onlyOwner {
        require(amount <= treasury, "exceeds treasury");
        treasury -= amount;
        (bool ok, ) = to.call{value: amount}("");
        require(ok, "transfer failed");
        emit PoolUpdated(rewardPool, treasury, totalDeposits, totalDistributed);
    }
    function fundRewardPool() external payable onlyOwner {
        rewardPool += msg.value;
        emit PoolUpdated(rewardPool, treasury, totalDeposits, totalDistributed);
    }

    // ---------- Player ----------
    function registerPlayer() external {
        _register(msg.sender);
    }

    function _register(address who) internal {
        Player storage p = _players[who];
        if (!p.registered) {
            p.registered = true;
            p.lastUpdate = block.timestamp;
            p.minerCounts = new uint256[](miners.length);
            playerList.push(who);
            emit PlayerRegistered(who);
        } else if (p.minerCounts.length < miners.length) {
            // sync array length if new miner types were added
            uint256[] memory next = new uint256[](miners.length);
            for (uint256 i = 0; i < p.minerCounts.length; i++) next[i] = p.minerCounts[i];
            p.minerCounts = next;
        }
    }

    function _accrue(Player storage p) internal {
        uint256 dt = block.timestamp - p.lastUpdate;
        if (dt > 0 && p.ratePerSecond > 0) {
            p.pending += dt * p.ratePerSecond;
        }
        p.lastUpdate = block.timestamp;
    }

    function buyMiner(uint256 minerType) external payable {
        require(!miningPaused, "mining paused");
        require(minerType < miners.length, "bad miner");
        MinerType memory m = miners[minerType];
        require(m.active, "inactive");
        require(msg.value == m.price, "wrong price");

        _register(msg.sender);
        Player storage p = _players[msg.sender];
        _accrue(p);
        p.minerCounts[minerType] += 1;
        p.totalInvested += msg.value;
        p.ratePerSecond += m.ratePerSecond;

        uint256 toPool = (msg.value * rewardBps) / 10_000;
        uint256 toTreasury = msg.value - toPool;
        rewardPool += toPool;
        treasury += toTreasury;
        totalDeposits += msg.value;

        emit MinerPurchased(msg.sender, minerType, msg.value);
        emit PoolUpdated(rewardPool, treasury, totalDeposits, totalDistributed);
    }

    function claimRewards() external {
        require(!withdrawPaused, "withdraw paused");
        Player storage p = _players[msg.sender];
        require(p.registered, "not registered");
        _accrue(p);
        uint256 amount = p.pending;
        require(amount >= WITHDRAW_THRESHOLD, "below threshold");
        require(rewardPool >= amount, "insufficient pool");

        p.pending = 0;
        p.lifetimeRewards += amount;
        rewardPool -= amount;
        totalDistributed += amount;

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");

        emit RewardsClaimed(msg.sender, amount);
        emit PoolUpdated(rewardPool, treasury, totalDeposits, totalDistributed);
    }

    // ---------- Views ----------
    function calculateRewards(address who) external view returns (uint256) {
        Player storage p = _players[who];
        if (!p.registered) return 0;
        uint256 dt = block.timestamp - p.lastUpdate;
        return p.pending + (dt * p.ratePerSecond);
    }

    function getPlayer(address who) external view returns (Player memory) {
        return _players[who];
    }

    function getPoolInfo() external view returns (
        uint256 _rewardPool,
        uint256 _treasury,
        uint256 _totalDeposits,
        uint256 _totalDistributed
    ) {
        return (rewardPool, treasury, totalDeposits, totalDistributed);
    }

    function minerCount() external view returns (uint256) { return miners.length; }
    function playerCount() external view returns (uint256) { return playerList.length; }

    receive() external payable {
        rewardPool += msg.value;
        emit PoolUpdated(rewardPool, treasury, totalDeposits, totalDistributed);
    }
}
