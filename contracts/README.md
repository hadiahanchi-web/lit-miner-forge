# LiteMiner V3 — Multi-Contract Architecture

Six contracts, hardened for production:

| Contract | Role |
| --- | --- |
| `v3/RewardToken.sol` | ERC20 **LFR** minted as mining rewards. |
| `v3/TreasuryVault.sol` | Segmented native (zkLTC) vault: reward / reserve / dev. |
| `v3/RiskEngine.sol` | Anti-bot + anti-whale scoring, per-user. |
| `v3/EmissionOracle.sol` | Dynamic emission bps as a function of TVL + active users. |
| `v3/V3MiningCore.sol` | UUPS upgradeable mining engine. Buys in native, rewards in LFR. |
| `v3/V3Proxy.sol` | ERC1967 proxy wrapper (used indirectly via `deployProxy`). |

Economic model: users **buy miners with native zkLTC** (forwarded to the Vault, split 10 % reserve / 10 % dev / 80 % reward pool). Claims mint **LFR** 1:1 against consumed reward-pool liquidity, backing the token with real reserves in the vault.

## Deploy

```bash
cd contracts
cp .env.example .env         # set DEPLOYER_PRIVATE_KEY
bun install                  # or npm/pnpm/yarn install
bun run compile
bun run deploy:liteforge
```

The script prints five addresses. Paste them into `../src/lib/contract.ts` (or set matching `VITE_*` env vars) so the UI targets your V3 deployment.

## Upgrades

`V3MiningCore` is UUPS. Deploy a new implementation and call `upgradeToAndCall` from the current owner:

```ts
const NewImpl = await ethers.getContractFactory("V3MiningCoreV2");
await upgrades.upgradeProxy(coreProxyAddress, NewImpl);
```

## Access wiring

After deploy the script calls:

- `RewardToken.setMinter(core)`
- `TreasuryVault.setCore(core)`
- `RiskEngine.setCore(core)`
- `EmissionOracle.setCore(core)`

Each module also exposes `lock*` to permanently freeze that wiring once you are happy.
