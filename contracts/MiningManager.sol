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
    uint256 public constant DIMINISH_THRESHOLD = 10;
    uint256 public constant DIMINISH_BPS = 5000;

    uint256 public constant PRICE_CURVE_BPS = 12500; // 1.25x
    uint256 public constant PRICE_DEN = 10000;
    uint256 public constant PRICE_CAP = 40;

    uint256 public constant COOLDOWN = 3;
    uint256 public constant MAX_CLAIM_POOL_BPS = 2000;

    // ---------- STATE ----------
    address public owner;
    bool public miningPaused;
    bool public withdrawPaused;

    uint256 private _lock;

    uint256 public rewardPool;
    uint256 public treasury;

    uint256 public emissionRatePerSecondGlobal = 10_000;

    MinerType[] public miners;
    mapping(address => Player) private players;
    address[] public playerList;

    mapping(uint256 => uint256) public totalMinted;
    mapping(address => uint256) public lastAction;
    mapping(address => bool) public admins;

    // ---------- EVENTS ----------
    event PlayerRegistered(address indexed player);
    event MinerPurchased(address indexed player, uint256 indexed id, uint256 price);
    event RewardsClaimed(address indexed player, uint256 gross, uint256 net, uint256 fee);
    event PoolUpdated(uint256 rewardPool, uint256 treasury);
    event AdminAdded(address indexed newAdmin, address indexed addedBy);
    event AdminRemoved(address indexed admin, address indexed removedBy);

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
        admins[msg.sender] = true;

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

    // ---------- CORE ----------
    function _accrue(Player storage p) internal {
        uint256 dt = block.timestamp - p.lastUpdate;
        if (dt > 0 && p.ratePerSecond > 0) {
            p.pending += (dt * p.ratePerSecond * emissionRatePerSecondGlobal) / 10_000;
        }
        p.lastUpdate = block.timestamp;
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

        totalMinted[id]++;
        lastAction[msg.sender] = block.timestamp;

        p.totalInvested += msg.value;

        _recomputeRate(p);

        uint256 toPool = (msg.value * 7000) / 10000;
        rewardPool += toPool;
        treasury += msg.value - toPool;

        emit MinerPurchased(msg.sender, id, msg.value);
        emit PoolUpdated(rewardPool, treasury);
    }

    // ---------- RATE ----------
    function _effective(uint256 n) internal pure returns (uint256) {
        if (n <= DIMINISH_THRESHOLD) return n * 10000;
        return (DIMINISH_THRESHOLD * 10000) + ((n - DIMINISH_THRESHOLD) * DIMINISH_BPS);
    }

    function _recomputeRate(Player storage p) internal {
        uint256 total;

        for (uint256 i = 0; i < miners.length; i++) {
            if (i >= p.minerCounts.length) break;

            uint256 n = p.minerCounts[i];
            if (n == 0) continue;

            uint256 base = miners[i].ratePerSecond * _effective(n) / 10000;

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

        uint256 gross = p.pending;
        require(gross >= WITHDRAW_THRESHOLD, "low");

        if (gross > rewardPool) gross = rewardPool;

        uint256 cap = (rewardPool * MAX_CLAIM_POOL_BPS) / 10000;
        if (gross > cap) gross = cap;

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
        return p.pending + (dt * p.ratePerSecond * emissionRatePerSecondGlobal) / 10000;
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
            p.registered,
            p.totalInvested,
            p.lifetimeRewards,
            p.lastUpdate,
            p.pending,
            p.ratePerSecond,
            p.minerCounts,
            p.minerLevels
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
            currentPrice(id),
            m.price,
            m.ratePerSecond,
            m.unlockRequiresId,
            m.unlockMinInvested,
            m.active
        );
    }

    function getMinerMinted(uint256 id) external view returns (uint256) {
        return totalMinted[id];
    }

    function minersCount() external view returns (uint256) {
        return miners.length;
    }

    function playersCount() external view returns (uint256) {
        return playerList.length;
    }

    // ---------- ADMIN ----------
    function setEmission(uint256 bps) external onlyOwner {
        require(bps <= 100000, "too high");
        emissionRatePerSecondGlobal = bps;
    }

    function setMiningPaused(bool v) external onlyOwner {
        miningPaused = v;
    }

    function setWithdrawPaused(bool v) external onlyOwner {
        withdrawPaused = v;
    }

    function fundRewardPool() external payable onlyOwner {
        rewardPool += msg.value;
        emit PoolUpdated(rewardPool, treasury);
    }

    function withdrawTreasury(address to, uint256 amount) external onlyOwner nonReentrant {
        require(amount <= treasury, "exceeds");
        treasury -= amount;
        (bool ok,) = to.call{value: amount}("");
        require(ok, "fail");
        emit PoolUpdated(rewardPool, treasury);
    }

    function addAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "zero");
        require(!admins[newAdmin], "exists");
        admins[newAdmin] = true;
        emit AdminAdded(newAdmin, msg.sender);
    }

    function removeAdmin(address admin) external onlyOwner {
        require(admin != owner, "owner locked");
        require(admins[admin], "not admin");
        admins[admin] = false;
        emit AdminRemoved(admin, msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero");
        owner = newOwner;
        if (!admins[newOwner]) {
            admins[newOwner] = true;
            emit AdminAdded(newOwner, msg.sender);
        }
    }

    receive() external payable {
        rewardPool += msg.value;
    }
}
