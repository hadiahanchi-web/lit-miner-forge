# LiteMiner Contracts — LitVM LiteForge (chain 4441)

## MiningManager.sol

- `registerPlayer()` — one-shot per wallet
- `buyMiner(minerType)` — payable, must equal `miners[minerType].price`
- `claimRewards()` — requires pending >= 10 zkLTC and pool solvency
- `calculateRewards(address)` — view, includes live accrual
- `getPlayer(address)` — full player struct
- `getPoolInfo()` — reward pool / treasury / deposits / distributed

Owner-only: `addMiner`, `updateMiner`, `setSplit`, `setPaused`, `withdrawTreasury`, `fundRewardPool`.

Events: `PlayerRegistered`, `MinerPurchased`, `RewardsClaimed`, `PoolUpdated`, `MinerAdded`, `MinerUpdated`, `SplitUpdated`, `PausedSet`.

## Deploy with Hardhat

```bash
npm i -D hardhat @nomicfoundation/hardhat-toolbox
npx hardhat init   # (choose "Create a TypeScript project", overwrite hardhat.config.ts below)
```

Minimal `hardhat.config.ts`:

```ts
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: { version: "0.8.24", settings: { optimizer: { enabled: true, runs: 200 } } },
  networks: {
    liteforge: {
      url: "https://rpc.liteforge.network",
      chainId: 4441,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};
export default config;
```

Deploy script `scripts/deploy.ts`:

```ts
import { ethers } from "hardhat";
async function main() {
  const M = await ethers.getContractFactory("MiningManager");
  const c = await M.deploy();
  await c.waitForDeployment();
  console.log("MiningManager:", await c.getAddress());
  // Seed reward pool so early claims can succeed:
  const tx = await c.fundRewardPool({ value: ethers.parseEther("100") });
  await tx.wait();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

```bash
PRIVATE_KEY=0x... npx hardhat run scripts/deploy.ts --network liteforge
```

Paste the deployed address into `src/lib/contract.ts` (`MINING_MANAGER_ADDRESS`).
The frontend currently runs a local, spec-identical simulation so the UI is playable
before deploy — swap the calls in `src/lib/mining-state.ts` for wagmi
`useReadContract` / `useWriteContract` against the ABI in `src/lib/contract.ts`.
