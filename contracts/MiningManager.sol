// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MiningManager v2 — LiteMiner protocol for LitVM LiteForge (chain 4441)
/// @notice Players buy on-chain miners with zkLTC, upgrade them for +25% rate per
///         level up to L10, and can refer new players for a 5% treasury bonus.
///         Every purchase splits into the reward pool (default 80%) and treasury
///         (default 20%). Rewards accrue continuously and can be claimed once
///         >= WITHDRAW_THRESHOLD. Claim is capped at the pool balance so the
///         contract can never revert due to depletion.
contract MiningManager {
    // ---------- Types ----------
    struct MinerType {
        uint256 price;         // wei
        uint256 ratePerSecond; // wei per second per unit at L1
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
        uint256[] minerLevels; // 0 = unowned, otherwise 1..MAX_LEVEL
        address  referrer;
        uint256  referralEarnings;
    }

    // ---------- Constants ----------
    uint256 public constant WITHDRAW_THRESHOLD = 10 ether;
    uint256 public constant MAX_LEVEL = 10;
    uint256 public constant LEVEL_STEP_BPS = 2500; // +25% per level
    uint256 public constant REFERRAL_BPS = 500;    // 5% of purchase paid to referrer

    // ---------- Storage ----------
    address public owner;
    bool public miningPaused;
    bool public withdrawPaused;

    uint256 public rewardPool;
    uint256 public treasury;
    uint256 public totalDeposits;
    uint256 public totalDistributed;

    uint256 public rewardBps = 8000;
    uint256 public treasuryBps = 2000;

    MinerType[] public miners;
    mapping(address => Player) private _players;
    address[] public playerList;

    // ---------- Events ----------
    event PlayerRegistered(address indexed player, address indexed referrer);
    event MinerPurchased(address indexed player, uint256 indexed minerType, uint256 price);
    event MinerUpgraded(address indexed player, uint256 indexed minerType, uint256 newLevel, uint256 cost);
    event RewardsClaimed(address indexed player, uint256 amount);
    event ReferralPaid(address indexed referrer, address indexed from, uint256 amount);
    event PoolUpdated(uint256 rewardPool, uint256 treasury, uint256 totalDeposits, uint256 totalDistributed);
    event MinerAdded(uint256 indexed id, uint256 price, uint256 ratePerSecond);
    event MinerUpdated(uint256 indexed id, uint256 price, uint256 ratePerSecond, bool active);
    event SplitUpdated(uint256 rewardBps, uint256 treasuryBps);
    event PausedSet(bool mining, bool withdraw);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }

    constructor() {
        owner = msg.sender;
        // ID 0 — Basic USB Miner: 0.01 zkLTC, 0.0001 zkLTC/day
        _addMiner(1e16, uint256(1e14) / 86400);
        // ID 1 — Starter: 1 zkLTC, 0.01 zkLTC/day
        _addMiner(1 ether, uint256(1e16) / 86400);
        // ID 2 — GPU: 10 zkLTC, 0.12 zkLTC/day
        _addMiner(10 ether, uint256(12e16) / 86400);
        // ID 3 — ASIC: 50 zkLTC, 0.7 zkLTC/day
        _addMiner(50 ether, uint256(7e17) / 86400);
        // ID 4 — Quantum: 250 zkLTC, 4 zkLTC/day
        _addMiner(250 ether, uint256(4 ether) / 86400);
        // ID 5 — Fusion: 1000 zkLTC, 20 zkLTC/day
        _addMiner(1000 ether, uint256(20 ether) / 86400);
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
    function registerPlayer() external { _register(msg.sender, address(0)); }
    function registerWithReferrer(address referrer) external { _register(msg.sender, referrer); }

    function _register(address who, address referrer) internal {
        Player storage p = _players[who];
        if (!p.registered) {
            p.registered = true;
            p.lastUpdate = block.timestamp;
            p.minerCounts = new uint256[](miners.length);
            p.minerLevels = new uint256[](miners.length);
            if (referrer != address(0) && referrer != who && _players[referrer].registered) {
                p.referrer = referrer;
            }
            playerList.push(who);
            emit PlayerRegistered(who, p.referrer);
        } else {
            _syncArrays(p);
        }
    }

    function _syncArrays(Player storage p) internal {
        if (p.minerCounts.length < miners.length) {
            uint256 n = miners.length;
            uint256[] memory c = new uint256[](n);
            uint256[] memory l = new uint256[](n);
            for (uint256 i = 0; i < p.minerCounts.length; i++) {
                c[i] = p.minerCounts[i];
                l[i] = p.minerLevels[i];
            }
            p.minerCounts = c;
            p.minerLevels = l;
        }
    }

    function _accrue(Player storage p) internal {
        uint256 dt = block.timestamp - p.lastUpdate;
        if (dt > 0 && p.ratePerSecond > 0) {
            p.pending += dt * p.ratePerSecond;
        }
        p.lastUpdate = block.timestamp;
    }

    function _levelMultBps(uint256 level) internal pure returns (uint256) {
        if (level == 0) return 0;
        return 10_000 + (level - 1) * LEVEL_STEP_BPS;
    }

    function _recomputeRate(Player storage p) internal {
        uint256 total;
        for (uint256 i = 0; i < miners.length; i++) {
            if (p.minerCounts[i] == 0) continue;
            uint256 base = miners[i].ratePerSecond * p.minerCounts[i];
            total += (base * _levelMultBps(p.minerLevels[i])) / 10_000;
        }
        p.ratePerSecond = total;
    }

    function buyMiner(uint256 minerType) external payable {
        require(!miningPaused, "mining paused");
        require(minerType < miners.length, "bad miner");
        MinerType memory m = miners[minerType];
        require(m.active, "inactive");
        require(msg.value == m.price, "wrong price");

        if (!_players[msg.sender].registered) _register(msg.sender, address(0));
        Player storage p = _players[msg.sender];
        _syncArrays(p);
        _accrue(p);
        p.minerCounts[minerType] += 1;
        if (p.minerLevels[minerType] == 0) p.minerLevels[minerType] = 1;
        p.totalInvested += msg.value;
        _recomputeRate(p);

        uint256 toPool = (msg.value * rewardBps) / 10_000;
        uint256 toTreasury = msg.value - toPool;
        rewardPool += toPool;
        treasury += toTreasury;
        totalDeposits += msg.value;

        // Referral bonus from treasury
        if (p.referrer != address(0)) {
            uint256 refCut = (msg.value * REFERRAL_BPS) / 10_000;
            if (refCut > treasury) refCut = treasury;
            if (refCut > 0) {
                treasury -= refCut;
                Player storage r = _players[p.referrer];
                r.referralEarnings += refCut;
                r.pending += refCut;
                emit ReferralPaid(p.referrer, msg.sender, refCut);
            }
        }

        emit MinerPurchased(msg.sender, minerType, msg.value);
        emit PoolUpdated(rewardPool, treasury, totalDeposits, totalDistributed);
    }

    function upgradeMiner(uint256 minerType) external payable {
        require(!miningPaused, "mining paused");
        require(minerType < miners.length, "bad miner");
        Player storage p = _players[msg.sender];
        require(p.registered, "not registered");
        _syncArrays(p);
        uint256 lvl = p.minerLevels[minerType];
        require(lvl > 0 && p.minerCounts[minerType] > 0, "buy first");
        require(lvl < MAX_LEVEL, "max level");
        uint256 cost = (miners[minerType].price * 50 * lvl) / 100; // 0.5 * price * level
        require(msg.value == cost, "wrong cost");

        _accrue(p);
        p.minerLevels[minerType] = lvl + 1;
        p.totalInvested += msg.value;
        _recomputeRate(p);

        uint256 toPool = (msg.value * rewardBps) / 10_000;
        rewardPool += toPool;
        treasury += msg.value - toPool;
        totalDeposits += msg.value;

        emit MinerUpgraded(msg.sender, minerType, lvl + 1, cost);
        emit PoolUpdated(rewardPool, treasury, totalDeposits, totalDistributed);
    }

    function claimRewards() external {
        require(!withdrawPaused, "withdraw paused");
        Player storage p = _players[msg.sender];
        require(p.registered, "not registered");
        _accrue(p);
        require(p.pending >= WITHDRAW_THRESHOLD, "below threshold");

        // SAFETY: cap payout at the pool balance so the tx never reverts on depletion
        uint256 amount = p.pending;
        if (amount > rewardPool) amount = rewardPool;
        require(amount > 0, "pool empty");

        p.pending -= amount;
        p.lifetimeRewards += amount;
        rewardPool -= amount;
        totalDistributed += amount;

        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "transfer failed");

        emit RewardsClaimed(msg.sender, amount);
        emit PoolUpdated(rewardPool, treasury, totalDeposits, totalDistributed);
    }

    // ---------- Views ----------
    function upgradeCost(uint256 minerType, uint256 currentLevel) external view returns (uint256) {
        if (currentLevel == 0 || currentLevel >= MAX_LEVEL) return 0;
        return (miners[minerType].price * 50 * currentLevel) / 100;
    }

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
        uint256 _rewardPool, uint256 _treasury, uint256 _totalDeposits, uint256 _totalDistributed
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
