// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

interface IRewardToken {
    function mint(address to, uint256 amount) external;
}

interface ITreasuryVault {
    function deposit() external payable;
    function availableRewards() external view returns (uint256);
    function consume(uint256 amount) external;
    function rewardPool() external view returns (uint256);
    function reservePool() external view returns (uint256);
    function devPool() external view returns (uint256);
}

interface IRiskEngine {
    function updateScore(address user, uint256 power, uint256 frequency) external;
    function isBlocked(address user) external view returns (bool);
}

interface IEmissionOracle {
    function getEmission() external view returns (uint256);
    function updateTVL(uint256 tvl) external;
    function updateUsers(uint256 u) external;
}

/// @title V3MiningCore — UUPS upgradeable mining engine.
/// @notice Buys are paid in native (zkLTC) forwarded to the Vault. Rewards
///         are minted as LFR tokens, backed 1:1 by consumed vault liquidity.
contract V3MiningCore is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
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
        uint256 lifetimeRewards; // LFR
        uint256 lastUpdate;
        uint256 pending;         // LFR accrued
        uint256 ratePerSecond;
        uint256[] minerCounts;
        uint256[] minerLevels;
        uint256 actionCount;
    }

    // ---------- CONFIG ----------
    uint256 public constant WITHDRAW_THRESHOLD = 5e15;
    uint256 public constant MAINTENANCE_BPS = 500;   // fee on gross (LFR-side)
    uint256 public constant MAX_UNITS_PER_MINER = 100;
    uint256 public constant MAX_PLAYER_SHARE_BPS = 1500; // 15%
    uint256 public constant PRICE_CURVE_BPS = 12500;
    uint256 public constant PRICE_DEN = 10000;
    uint256 public constant PRICE_CAP = 40;
    uint256 public constant COOLDOWN = 3;

    // ---------- STATE ----------
    IRewardToken   public token;
    ITreasuryVault public treasury;
    IRiskEngine    public risk;
    IEmissionOracle public oracle;

    bool public miningPaused;
    bool public withdrawPaused;

    MinerType[] public miners;
    mapping(address => Player) private players;
    address[] public playerList;

    mapping(uint256 => uint256) public totalMinted;
    mapping(address => uint256) public lastAction;

    // ---------- EVENTS ----------
    event PlayerRegistered(address indexed player);
    event MinerPurchased(address indexed player, uint256 indexed id, uint256 price);
    event RewardsClaimed(address indexed player, uint256 gross, uint256 net, uint256 fee);
    event ModulesUpdated(address token, address treasury, address risk, address oracle);

    // ---------- ERRORS ----------
    error Paused();
    error Cooldown();
    error Inactive();
    error BadPrice();
    error CapReached();
    error NotRegistered();
    error BelowThreshold();
    error PoolLocked();
    error WhaleBlocked();
    error RiskBlocked();
    error ZeroAddress();

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address _token,
        address _treasury,
        address _risk,
        address _oracle
    ) public initializer {
        if (_token == address(0) || _treasury == address(0) || _risk == address(0) || _oracle == address(0))
            revert ZeroAddress();
        __Ownable_init(msg.sender);
        __UUPSUpgradeable_init();
        __ReentrancyGuard_init();

        token = IRewardToken(_token);
        treasury = ITreasuryVault(_treasury);
        risk = IRiskEngine(_risk);
        oracle = IEmissionOracle(_oracle);

        _addMiner(1e16,    1e12,  type(uint256).max, 0);
        _addMiner(1 ether, 1e14,  0, 0);
        _addMiner(10 ether, 12e14, 1, 0);
        _addMiner(50 ether, 7e15,  2, 0);
        _addMiner(250 ether, 4e16, 3, 0);
        _addMiner(1000 ether, 2e17, 4, 0);

        emit ModulesUpdated(_token, _treasury, _risk, _oracle);
    }

    function _authorizeUpgrade(address) internal override onlyOwner {}

    function _addMiner(uint256 price, uint256 rate, uint256 unlockId, uint256 minInvest) internal {
        miners.push(MinerType(price, rate, unlockId, minInvest, true));
    }

    // ---------- CORE ----------
    function _accrue(Player storage p) internal {
        uint256 dt = block.timestamp - p.lastUpdate;
        if (dt > 0 && p.ratePerSecond > 0) {
            uint256 emission = oracle.getEmission();
            p.pending += (dt * p.ratePerSecond * emission) / 10000;
        }
        p.lastUpdate = block.timestamp;
    }

    function _checkWhale(address user) internal view {
        uint256 totalPow = _totalPower();
        if (totalPow == 0) return;
        uint256 shareBps = (players[user].ratePerSecond * 10000) / totalPow;
        if (shareBps > MAX_PLAYER_SHARE_BPS) revert WhaleBlocked();
    }

    function _totalPower() internal view returns (uint256 total) {
        uint256 n = playerList.length;
        for (uint256 i = 0; i < n; i++) {
            total += players[playerList[i]].ratePerSecond;
        }
    }

    function _syncOracle() internal {
        oracle.updateTVL(treasury.rewardPool());
        oracle.updateUsers(playerList.length);
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
        if (miningPaused) revert Paused();
        if (block.timestamp < lastAction[msg.sender] + COOLDOWN) revert Cooldown();

        MinerType memory m = miners[id];
        if (!m.active) revert Inactive();

        uint256 price = currentPrice(id);
        if (msg.value != price) revert BadPrice();

        Player storage p = players[msg.sender];

        if (!p.registered) {
            p.registered = true;
            p.lastUpdate = block.timestamp;
            playerList.push(msg.sender);
            emit PlayerRegistered(msg.sender);
        }

        _accrue(p);

        if (p.minerCounts.length <= id) {
            uint256 extend = id + 1 - p.minerCounts.length;
            for (uint256 i = 0; i < extend; i++) {
                p.minerCounts.push(0);
                p.minerLevels.push(0);
            }
        }

        if (p.minerCounts[id] >= MAX_UNITS_PER_MINER) revert CapReached();

        p.minerCounts[id] += 1;
        if (p.minerLevels[id] == 0) p.minerLevels[id] = 1;
        p.ratePerSecond += m.ratePerSecond;

        totalMinted[id]++;
        lastAction[msg.sender] = block.timestamp;
        p.totalInvested += msg.value;
        p.actionCount += 1;

        // Forward funds to segmented vault (native).
        treasury.deposit{value: msg.value}();

        // Update oracle + risk score.
        _syncOracle();
        risk.updateScore(msg.sender, p.ratePerSecond, p.actionCount);

        emit MinerPurchased(msg.sender, id, msg.value);
    }

    // ---------- CLAIM ----------
    function claimRewards() external nonReentrant {
        if (withdrawPaused) revert Paused();

        Player storage p = players[msg.sender];
        if (!p.registered) revert NotRegistered();

        _accrue(p);
        _checkWhale(msg.sender);
        if (risk.isBlocked(msg.sender)) revert RiskBlocked();

        uint256 gross = p.pending;
        if (gross < WITHDRAW_THRESHOLD) revert BelowThreshold();

        uint256 available = treasury.availableRewards();
        if (available == 0) revert PoolLocked();
        if (gross > available) gross = available;

        uint256 fee = (gross * MAINTENANCE_BPS) / 10000;
        uint256 net = gross - fee;

        // Effects
        p.pending -= gross;
        p.lifetimeRewards += net;

        // Interactions: consume native backing, mint LFR.
        treasury.consume(gross);
        token.mint(msg.sender, net);

        _syncOracle();
        emit RewardsClaimed(msg.sender, gross, net, fee);
    }

    // ---------- VIEWS ----------
    function calculateRewards(address who) external view returns (uint256) {
        Player storage p = players[who];
        if (!p.registered) return 0;
        uint256 dt = block.timestamp - p.lastUpdate;
        uint256 emission = oracle.getEmission();
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
        return (currentPrice(id), m.price, m.ratePerSecond, m.unlockRequiresId, m.unlockMinInvested, m.active);
    }

    function minersCount() external view returns (uint256) { return miners.length; }
    function playersCount() external view returns (uint256) { return playerList.length; }
    function totalPower() external view returns (uint256) { return _totalPower(); }

    // ---------- ADMIN ----------
    function setMiningPaused(bool v) external onlyOwner { miningPaused = v; }
    function setWithdrawPaused(bool v) external onlyOwner { withdrawPaused = v; }

    function setModules(address _token, address _treasury, address _risk, address _oracle) external onlyOwner {
        if (_token == address(0) || _treasury == address(0) || _risk == address(0) || _oracle == address(0))
            revert ZeroAddress();
        token = IRewardToken(_token);
        treasury = ITreasuryVault(_treasury);
        risk = IRiskEngine(_risk);
        oracle = IEmissionOracle(_oracle);
        emit ModulesUpdated(_token, _treasury, _risk, _oracle);
    }
}
