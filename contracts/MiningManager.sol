// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MiningManager {

    struct MinerType {
        uint256 price;
        uint256 ratePerSecond;
        uint256 unlockRequiresId;
        uint256 unlockMinInvested;
        bool active;
    }

    struct Player {
        bool registered;
        uint256 totalInvested;
        uint256 lifetimeRewards;
        uint256 lastUpdate;
        uint256 pending;
        uint256 ratePerSecond;
        uint256[] minerCounts;
        uint256[] minerLevels;
        address referrer;
        uint256 referralEarnings;
        uint256 totalUpgrades;
        uint256 totalClaims;
    }

    // ---------- CONSTANTS ----------
    uint256 public constant WITHDRAW_THRESHOLD = 5e15;
    uint256 public constant MAX_LEVEL = 10;
    uint256 public constant LEVEL_STEP_BPS = 2500;
    uint256 public constant MAINTENANCE_BPS = 500;
    uint256 public constant REFERRAL_BPS = 500;
    uint256 public constant SENTINEL = type(uint256).max;
    uint256 public constant MAX_CLAIM_POOL_BPS = 2000;

    // Anti-whale economy
    uint256 public constant MAX_UNITS_PER_MINER = 100;      // per-wallet hard cap
    uint256 public constant DIMINISH_THRESHOLD = 10;        // full rate up to N units
    uint256 public constant DIMINISH_BPS = 5000;            // 50% on units above threshold
    uint256 public constant PRICE_CURVE_NUM = 5;            // 5/4 = 1.25x per global unit
    uint256 public constant PRICE_CURVE_DEN = 4;
    uint256 public constant PRICE_CURVE_MAX_STEPS = 40;     // cap 1.25^n growth (~7.5kx)
    uint256 public constant ACTION_COOLDOWN = 3;            // seconds between buy/upgrade

    // ---------- STATE ----------
    address public owner;
    bool public miningPaused;
    bool public withdrawPaused;

    uint256 private _lock;

    uint256 public rewardPool;
    uint256 public treasury;

    uint256 public totalDeposits;
    uint256 public totalDistributed;

    uint256 public emissionRatePerSecondGlobal = 10_000;

    MinerType[] public miners;
    mapping(address => Player) private players;
    address[] public playerList;

    /// @notice Global units minted per miner type (drives price curve).
    mapping(uint256 => uint256) public totalMintedPerMinerType;
    /// @notice Last buy/upgrade timestamp per wallet (cooldown gate).
    mapping(address => uint256) public lastActionAt;

    // ---------- EVENTS ----------
    event PlayerRegistered(address indexed player, address indexed referrer);
    event MinerPurchased(address indexed player, uint256 minerType, uint256 price);
    event MinerUpgraded(address indexed player, uint256 minerType, uint256 newLevel, uint256 cost);
    event RewardsClaimed(address indexed player, uint256 gross, uint256 net, uint256 fee);

    modifier onlyOwner() {
        require(msg.sender == owner, "not owner");
        _;
    }

    modifier nonReentrant() {
        require(_lock == 0, "reentrant");
        _lock = 1;
        _;
        _lock = 0;
    }

    constructor() {
        owner = msg.sender;

        _addMiner(1e16, 1e12, SENTINEL, 0);
        _addMiner(1 ether, 1e14, 0, 0);
        _addMiner(10 ether, 12e14, 1, 0);
        _addMiner(50 ether, 7e15, 2, 0);
        _addMiner(250 ether, 4e16, 3, 0);
        _addMiner(1000 ether, 2e17, 4, 0);
    }

    // ---------- MINER SETUP ----------
    function _addMiner(
        uint256 price,
        uint256 ratePerSecond,
        uint256 unlockId,
        uint256 unlockMinInvested
    ) internal {
        miners.push(MinerType(price, ratePerSecond, unlockId, unlockMinInvested, true));
    }

    // ---------- EMISSION ----------
    function _accrue(Player storage p) internal {
        uint256 dt = block.timestamp - p.lastUpdate;
        if (dt > 0 && p.ratePerSecond > 0) {
            uint256 reward =
                (dt * p.ratePerSecond * emissionRatePerSecondGlobal) / 10_000;

            p.pending += reward;
        }
        p.lastUpdate = block.timestamp;
    }

    // ---------- BUY ----------
    function buyMiner(uint256 id) external payable nonReentrant {
        require(!miningPaused, "paused");
        require(id < miners.length, "bad id");

        MinerType memory m = miners[id];
        require(m.active, "inactive");
        require(msg.value == m.price, "bad price");

        Player storage p = players[msg.sender];

        if (!p.registered) {
            p.registered = true;
            p.lastUpdate = block.timestamp;
            playerList.push(msg.sender);
        }

        _accrue(p);

        if (p.minerCounts.length <= id) {
            p.minerCounts.push(0);
            p.minerLevels.push(0);
        }

        p.minerCounts[id] += 1;
        if (p.minerLevels[id] == 0) p.minerLevels[id] = 1;

        p.totalInvested += msg.value;
        _recomputeRate(p);

        uint256 toPool = (msg.value * 7000) / 10_000;
        uint256 toTreasury = msg.value - toPool;

        rewardPool += toPool;
        treasury += toTreasury;
    }

    // ---------- RATE ----------
    function _recomputeRate(Player storage p) internal {
        uint256 total;

        for (uint256 i = 0; i < miners.length; i++) {
            if (i >= p.minerCounts.length) break;
            if (p.minerCounts[i] == 0) continue;

            uint256 base = miners[i].ratePerSecond * p.minerCounts[i];
            total += base;
        }

        p.ratePerSecond = total;
    }

    // ---------- CLAIM ----------
    function claimRewards() external nonReentrant {
        require(!withdrawPaused, "paused");

        Player storage p = players[msg.sender];
        require(p.registered, "not reg");

        _accrue(p);
        require(p.pending >= WITHDRAW_THRESHOLD, "low");

        uint256 gross = p.pending;

        if (gross > rewardPool) {
            gross = rewardPool;
        }

        require(gross > 0, "empty pool");

        uint256 cap = (rewardPool * MAX_CLAIM_POOL_BPS) / 10_000;
        if (cap > 0 && gross > cap) {
            gross = cap;
        }

        uint256 fee = (gross * MAINTENANCE_BPS) / 10_000;
        uint256 net = gross - fee;

        p.pending -= gross;
        p.lifetimeRewards += net;
        p.totalClaims++;

        rewardPool -= gross;
        treasury += fee;
        totalDistributed += net;

        (bool ok, ) = msg.sender.call{value: net}("");
        require(ok, "fail");

        emit RewardsClaimed(msg.sender, gross, net, fee);
    }

    // ---------- VIEW ----------
    function calculateRewards(address who) external view returns (uint256) {
        Player storage p = players[who];
        if (!p.registered) return 0;

        uint256 dt = block.timestamp - p.lastUpdate;

        return p.pending + (dt * p.ratePerSecond * emissionRatePerSecondGlobal) / 10_000;
    }

    // ---------- ADMIN ----------
    function setEmission(uint256 bps) external onlyOwner {
        require(bps <= 100_000, "too high");
        emissionRatePerSecondGlobal = bps;
    }

    receive() external payable {
        rewardPool += msg.value;
    }
}