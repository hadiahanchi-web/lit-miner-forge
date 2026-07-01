// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title MiningManager v3 — LiteMiner protocol for LitVM LiteForge (chain 4441)
/// @notice Dynamic emissions tied to pool health, maintenance fee on claim,
///         balanced exponential upgrades, tier unlock requirements, and a
///         5% referral bonus. Every claim is capped at the current pool
///         balance and can never revert on depletion. Reentrancy-protected
///         via a lightweight mutex; owner-only admin surface.
contract MiningManager {
    // ---------- Types ----------
    struct MinerType {
        uint256 price;             // wei
        uint256 ratePerSecond;     // wei/sec/unit at L1 (nominal, before emission)
        uint256 unlockRequiresId;  // must own >=1 of this tier to buy (type(uint256).max = none)
        uint256 unlockMinInvested; // OR must have this invested; 0 = none
        bool    active;
    }

    struct Player {
        bool     registered;
        uint256  totalInvested;
        uint256  lifetimeRewards;
        uint256  lastUpdate;
        uint256  pending;
        uint256  ratePerSecond;    // nominal (pre-emission) accrual rate
        uint256[] minerCounts;
        uint256[] minerLevels;     // 0 = unowned, otherwise 1..MAX_LEVEL
        address  referrer;
        uint256  referralEarnings;
        uint256  totalUpgrades;
        uint256  totalClaims;
    }

    // ---------- Constants (v4) ----------
    uint256 public constant WITHDRAW_THRESHOLD = 5e15;  // 0.005 zkLTC
    uint256 public constant MAX_LEVEL = 10;
    uint256 public constant LEVEL_STEP_BPS = 2500;      // +25% per level
    uint256 public constant REFERRAL_BPS = 500;         // 5% of purchase → referrer
    uint256 public constant MAINTENANCE_BPS = 500;      // 5% of claim → treasury
    uint256 public constant UPGRADE_BASE_BPS = 2000;    // L1→L2 cost = 20% of price
    uint256 public constant UPGRADE_GROWTH_NUM = 3;     // 1.5x per level
    uint256 public constant UPGRADE_GROWTH_DEN = 2;
    uint256 public constant SENTINEL = type(uint256).max;
    uint256 public constant EPOCH_LEN = 1 days;
    uint256 public constant ACTION_COOLDOWN = 3;        // seconds
    uint256 public constant CLAIMS_PER_EPOCH = 1;

    // ---------- Storage ----------
    address public owner;
    bool public miningPaused;
    bool public withdrawPaused;
    uint256 private _lock;

    uint256 public rewardPool;
    uint256 public treasury;
    uint256 public totalDeposits;
    uint256 public totalDistributed;

    // v4: 70/30 split, 5% daily emission of pool, 1% per-wallet cap of daily budget
    uint256 public rewardBps = 7000;
    uint256 public treasuryBps = 3000;
    uint256 public dailyEmissionBps = 500;
    uint256 public perWalletEpochCapBps = 100;

    // Global epoch budget
    uint256 public epoch;
    uint256 public epochBudget;
    uint256 public epochRemaining;


    MinerType[] public miners;
    mapping(address => Player) private _players;
    address[] public playerList;

    // ---------- Events ----------
    event PlayerRegistered(address indexed player, address indexed referrer);
    event MinerPurchased(address indexed player, uint256 indexed minerType, uint256 price);
    event MinerUpgraded(address indexed player, uint256 indexed minerType, uint256 newLevel, uint256 cost);
    event RewardsClaimed(address indexed player, uint256 gross, uint256 net, uint256 fee);
    event ReferralPaid(address indexed referrer, address indexed from, uint256 amount);
    event PoolUpdated(uint256 rewardPool, uint256 treasury, uint256 totalDeposits, uint256 totalDistributed);
    event MinerAdded(uint256 indexed id, uint256 price, uint256 ratePerSecond);
    event MinerUpdated(uint256 indexed id, uint256 price, uint256 ratePerSecond, bool active);
    event SplitUpdated(uint256 rewardBps, uint256 treasuryBps);
    event PausedSet(bool mining, bool withdraw);

    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier nonReentrant() { require(_lock == 0, "reentrant"); _lock = 1; _; _lock = 0; }

    constructor() {
        owner = msg.sender;
        // ID 0 — Basic USB (no unlock)
        _addMiner(1e16, uint256(1e14) / 86400, SENTINEL, 0);
        // ID 1 — Starter (unlock: own USB)
        _addMiner(1 ether, uint256(1e16) / 86400, 0, 0);
        // ID 2 — GPU (unlock: own Starter)
        _addMiner(10 ether, uint256(12e16) / 86400, 1, 0);
        // ID 3 — ASIC (unlock: own GPU)
        _addMiner(50 ether, uint256(7e17) / 86400, 2, 0);
        // ID 4 — Quantum (unlock: own ASIC)
        _addMiner(250 ether, uint256(4 ether) / 86400, 3, 0);
        // ID 5 — Fusion (unlock: own Quantum)
        _addMiner(1000 ether, uint256(20 ether) / 86400, 4, 0);
    }

    // ---------- Owner ----------
    function _addMiner(
        uint256 price,
        uint256 ratePerSecond,
        uint256 unlockRequiresId,
        uint256 unlockMinInvested
    ) internal {
        miners.push(MinerType({
            price: price,
            ratePerSecond: ratePerSecond,
            unlockRequiresId: unlockRequiresId,
            unlockMinInvested: unlockMinInvested,
            active: true
        }));
        emit MinerAdded(miners.length - 1, price, ratePerSecond);
    }
    function addMiner(
        uint256 price,
        uint256 ratePerSecond,
        uint256 unlockRequiresId,
        uint256 unlockMinInvested
    ) external onlyOwner {
        _addMiner(price, ratePerSecond, unlockRequiresId, unlockMinInvested);
    }
    function updateMiner(
        uint256 id,
        uint256 price,
        uint256 ratePerSecond,
        uint256 unlockRequiresId,
        uint256 unlockMinInvested,
        bool active
    ) external onlyOwner {
        require(id < miners.length, "bad id");
        miners[id] = MinerType({
            price: price,
            ratePerSecond: ratePerSecond,
            unlockRequiresId: unlockRequiresId,
            unlockMinInvested: unlockMinInvested,
            active: active
        });
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
    function transferOwnership(address to) external onlyOwner {
        require(to != address(0), "zero");
        owner = to;
    }
    function withdrawTreasury(address to, uint256 amount) external onlyOwner nonReentrant {
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

    // ---------- Dynamic emissions ----------
    /// @notice Returns the current emission multiplier in bps (0..10000).
    ///         Health = rewardPool / expectedRewardFunding.
    ///         >=60% → 100%, 40–60% → 75%, 20–40% → 50%, 10–20% → 25%, else 10% or 0.
    function emissionBps() public view returns (uint256) {
        uint256 funded = (totalDeposits * rewardBps) / 10_000;
        if (funded == 0) return 10_000;
        uint256 healthBps = (rewardPool * 10_000) / funded;
        if (rewardPool == 0) return 0;
        if (healthBps >= 6000) return 10_000;
        if (healthBps >= 4000) return 7_500;
        if (healthBps >= 2000) return 5_000;
        if (healthBps >= 1000) return 2_500;
        return 1_000;
    }

    function _accrue(Player storage p) internal {
        uint256 dt = block.timestamp - p.lastUpdate;
        if (dt > 0 && p.ratePerSecond > 0) {
            uint256 emitted = (dt * p.ratePerSecond * emissionBps()) / 10_000;
            p.pending += emitted;
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

    function _checkUnlock(uint256 minerType, Player storage p) internal view {
        MinerType memory m = miners[minerType];
        if (m.unlockRequiresId == SENTINEL && m.unlockMinInvested == 0) return;
        bool ok = false;
        if (m.unlockRequiresId != SENTINEL && p.minerCounts.length > m.unlockRequiresId) {
            ok = p.minerCounts[m.unlockRequiresId] > 0;
        }
        if (!ok && m.unlockMinInvested > 0) {
            ok = p.totalInvested >= m.unlockMinInvested;
        }
        require(ok, "tier locked");
    }

    function buyMiner(uint256 minerType) external payable nonReentrant {
        require(!miningPaused, "mining paused");
        require(minerType < miners.length, "bad miner");
        MinerType memory m = miners[minerType];
        require(m.active, "inactive");
        require(msg.value == m.price, "wrong price");

        if (!_players[msg.sender].registered) _register(msg.sender, address(0));
        Player storage p = _players[msg.sender];
        _syncArrays(p);
        _checkUnlock(minerType, p);
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

    /// @notice Balanced exponential upgrade: cost = price * 0.2 * 1.5^(level-1)
    function upgradeCost(uint256 minerType, uint256 currentLevel) public view returns (uint256) {
        if (currentLevel == 0 || currentLevel >= MAX_LEVEL) return 0;
        uint256 c = (miners[minerType].price * UPGRADE_BASE_BPS) / 10_000;
        for (uint256 i = 1; i < currentLevel; i++) {
            c = (c * UPGRADE_GROWTH_NUM) / UPGRADE_GROWTH_DEN;
        }
        return c;
    }

    function upgradeMiner(uint256 minerType) external payable nonReentrant {
        require(!miningPaused, "mining paused");
        require(minerType < miners.length, "bad miner");
        Player storage p = _players[msg.sender];
        require(p.registered, "not registered");
        _syncArrays(p);
        uint256 lvl = p.minerLevels[minerType];
        require(lvl > 0 && p.minerCounts[minerType] > 0, "buy first");
        require(lvl < MAX_LEVEL, "max level");
        uint256 cost = upgradeCost(minerType, lvl);
        require(msg.value == cost, "wrong cost");

        _accrue(p);
        p.minerLevels[minerType] = lvl + 1;
        p.totalInvested += msg.value;
        p.totalUpgrades += 1;
        _recomputeRate(p);

        uint256 toPool = (msg.value * rewardBps) / 10_000;
        rewardPool += toPool;
        treasury += msg.value - toPool;
        totalDeposits += msg.value;

        emit MinerUpgraded(msg.sender, minerType, lvl + 1, cost);
        emit PoolUpdated(rewardPool, treasury, totalDeposits, totalDistributed);
    }

    function claimRewards() external nonReentrant {
        require(!withdrawPaused, "withdraw paused");
        Player storage p = _players[msg.sender];
        require(p.registered, "not registered");
        _accrue(p);
        require(p.pending >= WITHDRAW_THRESHOLD, "below threshold");

        // Cap gross payout at pool balance; net = gross - maintenance fee to treasury
        uint256 gross = p.pending;
        if (gross > rewardPool) gross = rewardPool;
        require(gross > 0, "pool empty");

        uint256 fee = (gross * MAINTENANCE_BPS) / 10_000;
        uint256 net = gross - fee;

        p.pending -= gross;
        p.lifetimeRewards += net;
        p.totalClaims += 1;
        rewardPool -= gross;
        treasury += fee;
        totalDistributed += net;

        (bool ok, ) = msg.sender.call{value: net}("");
        require(ok, "transfer failed");

        emit RewardsClaimed(msg.sender, gross, net, fee);
        emit PoolUpdated(rewardPool, treasury, totalDeposits, totalDistributed);
    }

    // ---------- Views ----------
    function calculateRewards(address who) external view returns (uint256) {
        Player storage p = _players[who];
        if (!p.registered) return 0;
        uint256 dt = block.timestamp - p.lastUpdate;
        uint256 emitted = (dt * p.ratePerSecond * emissionBps()) / 10_000;
        return p.pending + emitted;
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
