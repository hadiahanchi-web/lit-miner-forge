// V3 addresses — paste from `contracts/scripts/deploy-v3.ts` output, or set VITE_* env vars.
// Set CORE_ADDRESS to the UUPS proxy address (returned by `upgrades.deployProxy`).
const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const ZERO = "0x0000000000000000000000000000000000000000" as const;

export const CORE_ADDRESS = ((env.VITE_CORE_ADDRESS as `0x${string}` | undefined) ?? ZERO) as `0x${string}`;
export const TOKEN_ADDRESS = ((env.VITE_TOKEN_ADDRESS as `0x${string}` | undefined) ?? ZERO) as `0x${string}`;
export const TREASURY_ADDRESS = ((env.VITE_TREASURY_ADDRESS as `0x${string}` | undefined) ?? ZERO) as `0x${string}`;
export const RISK_ADDRESS = ((env.VITE_RISK_ADDRESS as `0x${string}` | undefined) ?? ZERO) as `0x${string}`;
export const ORACLE_ADDRESS = ((env.VITE_ORACLE_ADDRESS as `0x${string}` | undefined) ?? ZERO) as `0x${string}`;

// Back-compat alias for anything still importing the old name.
export const MINING_MANAGER_ADDRESS = CORE_ADDRESS;

// ---------- Core (V3MiningCore) ABI ----------
export const CORE_ABI = [
  { type: "function", name: "buyMiner", stateMutability: "payable",
    inputs: [{ name: "id", type: "uint256" }], outputs: [] },
  { type: "function", name: "claimRewards", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "currentPrice", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "calculateRewards", stateMutability: "view",
    inputs: [{ name: "who", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "owner", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "totalPower", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "WITHDRAW_THRESHOLD", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "MAX_UNITS_PER_MINER", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "MAINTENANCE_BPS", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "COOLDOWN", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "MAX_PLAYER_SHARE_BPS", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "miningPaused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "withdrawPaused", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
  { type: "function", name: "totalMinted", stateMutability: "view",
    inputs: [{ type: "uint256" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lastAction", stateMutability: "view",
    inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "minersCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "playersCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "playerList", stateMutability: "view",
    inputs: [{ type: "uint256" }], outputs: [{ type: "address" }] },
  { type: "function", name: "setMiningPaused", stateMutability: "nonpayable",
    inputs: [{ name: "v", type: "bool" }], outputs: [] },
  { type: "function", name: "setWithdrawPaused", stateMutability: "nonpayable",
    inputs: [{ name: "v", type: "bool" }], outputs: [] },
  { type: "function", name: "token", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "treasury", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "risk", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "oracle", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "getMiner", stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      { name: "price", type: "uint256" },
      { name: "basePrice", type: "uint256" },
      { name: "ratePerSecond", type: "uint256" },
      { name: "unlockRequiresId", type: "uint256" },
      { name: "unlockMinInvested", type: "uint256" },
      { name: "active", type: "bool" },
    ] },
  { type: "function", name: "getPlayer", stateMutability: "view",
    inputs: [{ name: "who", type: "address" }],
    outputs: [
      { name: "registered", type: "bool" },
      { name: "totalInvested", type: "uint256" },
      { name: "lifetimeRewards", type: "uint256" },
      { name: "lastUpdate", type: "uint256" },
      { name: "pending", type: "uint256" },
      { name: "ratePerSecond", type: "uint256" },
      { name: "minerCounts", type: "uint256[]" },
      { name: "minerLevels", type: "uint256[]" },
    ] },
] as const;

// Back-compat: some existing modules import MINING_MANAGER_ABI.
export const MINING_MANAGER_ABI = CORE_ABI;

// ---------- RewardToken (LFR) ABI ----------
export const TOKEN_ABI = [
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "totalSupply", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "balanceOf", stateMutability: "view",
    inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "minter", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

// ---------- TreasuryVault ABI ----------
export const TREASURY_ABI = [
  { type: "function", name: "rewardPool", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "reservePool", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "devPool", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "reserveBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "devBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "availableRewards", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "withdrawDev", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [] },
] as const;

// ---------- RiskEngine ABI ----------
export const RISK_ABI = [
  { type: "function", name: "score", stateMutability: "view",
    inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "maxScore", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "isBlocked", stateMutability: "view",
    inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "setMaxScore", stateMutability: "nonpayable",
    inputs: [{ name: "v", type: "uint256" }], outputs: [] },
] as const;

// ---------- EmissionOracle ABI ----------
export const ORACLE_ABI = [
  { type: "function", name: "getEmission", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tvl", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "activeUsers", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "base", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "min", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "capTVL", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "setCurve", stateMutability: "nonpayable",
    inputs: [
      { name: "_base", type: "uint256" },
      { name: "_min", type: "uint256" },
      { name: "_capTVL", type: "uint256" },
    ], outputs: [] },
] as const;
