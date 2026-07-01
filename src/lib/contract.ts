// Deploy MiningManager.sol from /contracts, then paste address here.
export const MINING_MANAGER_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

export const MINING_MANAGER_ABI = [
  {
    type: "function",
    name: "registerPlayer",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "buyMiner",
    stateMutability: "payable",
    inputs: [{ name: "minerType", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimRewards",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "calculateRewards",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getPlayer",
    stateMutability: "view",
    inputs: [{ name: "player", type: "address" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "registered", type: "bool" },
          { name: "totalInvested", type: "uint256" },
          { name: "lifetimeRewards", type: "uint256" },
          { name: "lastUpdate", type: "uint256" },
          { name: "pending", type: "uint256" },
          { name: "ratePerSecond", type: "uint256" },
          { name: "minerCounts", type: "uint256[]" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getPoolInfo",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "rewardPool", type: "uint256" },
      { name: "treasury", type: "uint256" },
      { name: "totalDeposits", type: "uint256" },
      { name: "totalDistributed", type: "uint256" },
    ],
  },
] as const;
