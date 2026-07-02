// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MiningManager {

    // ---------- DATA ----------
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
    }

    // ---------- CONFIG ----------
    uint256 public constant WITHDRAW_THRESHOLD = 5e15;
    uint256 public constant MAINTENANCE_BPS = 500;

    uint256 public constant MAX_UNITS_PER_MINER = 100;

    // anti-whale
    uint256 public constant MAX_PLAYER_SHARE_BPS = 1500; // 15%

    // anti-collapse
    uint256 public constant MIN_POOL_RESERVE_BPS = 1000; // 10%

    // emission curve
    uint256 public constant EMISSION_MAX_BPS = 10000; // 1x
    uint256 public constant EMISSION_MIN_BPS = 500;   // 0.05x
    uint256 public constant TVL_CAP = 500 ether;

    uint256 public constant PRICE_CURVE_BPS = 12500;
    uint256 public constant PRICE_DEN = 10000;
    uint256 public constant PRICE_CAP = 40;

    uint256 public constant COOLDOWN = 3;

    // ---------- STATE ----------
    address public owner;
    bool public miningPaused;
    bool public withdrawPaused;

    uint256 private _lock;

    uint256 public rewardPool;
    uint256 public treasury;

    MinerType[] public miners;
    mapping(address => Player) private players;
    address[] public playerList;

    mapping(uint256 => uint256) public totalMinted;
    mapping(address => uint256) public lastAction;

    // ---------- EVENTS ----------
    event PlayerRegistered(address indexed player);
    event MinerPurchased(address indexed player, uint256 indexed id, uint256 price);
    event RewardsClaimed(address indexed player, uint256 gross, uint256 net, uint256 fee);
    event PoolUpdated(uint256 rewardPool, uint256 treasury);

    // ---------- MODIFIERS ----------
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

        _addMiner(1e16, 1e12, type(uint256).max, 0);
        _addMiner(1 ether, 1e14, 0, 0);
        _addMiner(10 ether, 12e14, 1, 0);
        _addMiner(50 ether, 7e15, 2, 0);
        _addMiner(250 ether, 4e16, 3, 0);
        _addMiner(1000 ether, 2e17, 4, 0);
    }

    function _addMiner(
        uint256 price,
        uint256 rate,
        uint256 unlockId,
        uint256 minInvest
    ) internal {
        miners.push(MinerType(price, rate, unlockId, minInvest, true));
    }

    // ---------- EMISSION (DYNAMIC) ----------
    function getEmissionBps() public view returns (uint256) {
        uint256 tvl = rewardPool;
        if (tvl >= TVL_CAP) return EMISSION_MIN_BPS;
        return EMISSION_MAX_BPS
            - ((tvl * (EMISSION_MAX_BPS - EMISSION_MIN_BPS)) / TVL_CAP);
    }

    // ---------- CORE ----------
    function _accrue(Player storage p) internal {
        uint256 dt = block.timestamp - p.lastUpdate;
        if (dt > 0 && p.ratePerSecond > 0) {
            uint256 emission = getEmissionBps();
            p.pending += (dt * p.ratePerSecond * emission) / 10000;
        }
        p.lastUpdate = block.timestamp;
    }

    // ---------- ANTI-WHALE ----------
    function _checkWhale(address user) internal view {
        uint256 totalPower = 0;
        for (uint256 i = 0; i < playerList.length; i++) {
            totalPower += players[playerList[i]].ratePerSecond;
        }
        if (totalPower == 0) return;
        uint256 shareBps =
            (players[user].ratePerSecond * 10000) / totalPower;
        require(shareBps <= MAX_PLAYER_SHARE_BPS, "whale blocked");
    }

    // ---------- ANTI-COLLAPSE ----------
    function _getAvailablePool() internal view returns (uint256) {
        uint256 reserve = (rewardPool * MIN_POOL_RESERVE_BPS) / 10000;
        if (rewardPool <= reserve) return 0;
        return rewardPool - reserve;
    }

    function getAvailablePool() external view returns (uint256) {
        return _getAvailablePool();
    }

    function getReservedPool() external view returns (uint256) {
        return (rewardPool * MIN_POOL_RESERVE_BPS) / 10000;
    }

    // ---------- PRICE ----------
    function currentPrice(uint256 id) public view returns (uint256) {
        uint256 k = totalMinted[id];
        if (k > PRICE_CAP) k = PRICE_CAP;
        uint256 price = miners[id].price;
        while (k > 0) {
            price = (price * PRICE_CURVE_BPS) / PRICE_DEN;
            k--;
        }
        return price;
    }

    // ---------- BUY ----------
    function buyMiner(uint256 id) external payable nonReentrant {
        require(!miningPaused, "paused");
        require(block.timestamp >= lastAction[msg.sender] + COOLDOWN, "cooldown");

        MinerType memory m = miners[id];
        require(m.active, "inactive");

        uint256 price = currentPrice(id);
        require(msg.value == price, "bad price");

        Player storage p = players[msg.sender];

        if (!p.registered) {
            p.registered = true;
            p.lastUpdate = block.timestamp;
            playerList.push(msg.sender);
            emit PlayerRegistered(msg.sender);
        }

        _accrue(p);

        if (p.minerCounts.length <= id) {
            p.minerCounts.push(0);
            p.minerLevels.push(0);
        }

        require(p.minerCounts[id] < MAX_UNITS_PER_MINER, "cap");

        p.minerCounts[id] += 1;
        if (p.minerLevels[id] == 0) p.minerLevels[id] = 1;
        p.ratePerSecond += m.ratePerSecond;

        totalMinted[id]++;
        lastAction[msg.sender] = block.timestamp;

        p.totalInvested += msg.value;

        uint256 toPool = (msg.value * 7000) / 10000;
        rewardPool += toPool;
        treasury += msg.value - toPool;

        emit MinerPurchased(msg.sender, id, msg.value);
        emit PoolUpdated(rewardPool, treasury);
    }

    // ---------- CLAIM ----------
    function claimRewards() external nonReentrant {
        require(!withdrawPaused, "paused");

        Player storage p = players[msg.sender];
        require(p.registered, "not reg");

        _accrue(p);
        _checkWhale(msg.sender);

        uint256 gross = p.pending;
        require(gross >= WITHDRAW_THRESHOLD, "low");

        uint256 available = _getAvailablePool();
        require(available > 0, "pool locked");

        if (gross > available) gross = available;

        uint256 fee = (gross * MAINTENANCE_BPS) / 10000;
        uint256 net = gross - fee;

        p.pending -= gross;
        p.lifetimeRewards += net;

        rewardPool -= gross;
        treasury += fee;

        (bool ok,) = msg.sender.call{value: net}("");
        require(ok, "fail");

        emit RewardsClaimed(msg.sender, gross, net, fee);
        emit PoolUpdated(rewardPool, treasury);
    }

    // ---------- VIEW ----------
    function calculateRewards(address who) external view returns (uint256) {
        Player storage p = players[who];
        if (!p.registered) return 0;
        uint256 dt = block.timestamp - p.lastUpdate;
        uint256 emission = getEmissionBps();
        return p.pending + (dt * p.ratePerSecond * emission) / 10000;
    }

    function getPlayer(address who) external view returns (
        bool registered,
        uint256 totalInvested,
        uint256 lifetimeRewards,
        uint256 lastUpdate,
        uint256 pending,
        uint256 ratePerSecond,
        uint256[] memory minerCounts,
        uint256[] memory minerLevels
    ) {
        Player storage p = players[who];
        return (
            p.registered, p.totalInvested, p.lifetimeRewards, p.lastUpdate,
            p.pending, p.ratePerSecond, p.minerCounts, p.minerLevels
        );
    }

    function getMiner(uint256 id) external view returns (
        uint256 price,
        uint256 basePrice,
        uint256 ratePerSecond,
        uint256 unlockRequiresId,
        uint256 unlockMinInvested,
        bool active
    ) {
        MinerType memory m = miners[id];
        return (
            currentPrice(id), m.price, m.ratePerSecond,
            m.unlockRequiresId, m.unlockMinInvested, m.active
        );
    }

    function minersCount() external view returns (uint256) {
        return miners.length;
    }

    function playersCount() external view returns (uint256) {
        return playerList.length;
    }

    /// Sum of all players' ratePerSecond (for anti-whale share display).
    function totalPower() external view returns (uint256 total) {
        for (uint256 i = 0; i < playerList.length; i++) {
            total += players[playerList[i]].ratePerSecond;
        }
    }

    // ---------- ADMIN ----------
    function setMiningPaused(bool v) external onlyOwner {
        miningPaused = v;
    }

    function setWithdrawPaused(bool v) external onlyOwner {
        withdrawPaused = v;
    }

    receive() external payable {
        rewardPool += msg.value;
    }
}
