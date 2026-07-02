## LiteMiner V3 — Multi-Contract Architecture

Replace the single `MiningManager.sol` with a modular V3 system, hardened for production, plus a Hardhat deploy script and a full UI refactor. Rewards switch to an ERC20 token (LFR); purchases stay in native zkLTC.

---

### 1. Smart contracts (`contracts/v3/`)

Six new files, replacing `MiningManager.sol` entirely:

**`RewardToken.sol`** — ERC20 "LiteForge Reward" (LFR)
- OpenZeppelin `ERC20` + `Ownable`
- `minter` address set by owner (points to `V3MiningCore`)
- `mint(to, amount)` gated by `onlyMinter`
- Added: 18 decimals, `setMinter` (one-time-lock optional)

**`TreasuryVault.sol`** — segmented funds (reward / reserve / dev)
- Splits every `deposit()`: `reserveBps` (10%) → reserve, `devBps` (10%) → dev, rest → reward pool
- `consume(amount)` gated by `onlyCore` (core address set by owner)
- `withdrawDev(to, amount)` gated by `onlyOwner`
- Emits `Deposited`, `Consumed`, `DevWithdrawn`
- Holds native zkLTC (this is the on-chain liquidity backing LFR value/redemption model — see note below)

**`RiskEngine.sol`** — anti-bot / anti-whale scoring
- `updateScore(user, power, frequency)` gated by `onlyCore`
- `score[user]`, `isBlocked(user)` view
- Tunable `maxScore`, thresholds via `onlyOwner` setters
- Tracks `lastActionAt[user]` for frequency auto-calc

**`EmissionOracle.sol`** — dynamic emission brain
- `getEmission()` returns bps (0–10000)
- Curve: `base - (tvl * (base-min) / capTVL)`, floored at `min`
- User-pressure multiplier when `activeUsers > 1000`
- `updateTVL` / `updateUsers` gated by `onlyCore` (auto-called from Core on every action)
- Owner setters for `base`, `min`, `capTVL`

**`V3MiningCore.sol`** — UUPS upgradeable main engine
- `UUPSUpgradeable` + `OwnableUpgradeable` + `ReentrancyGuardUpgradeable`
- `initialize(token, treasury, risk, oracle)` — one-time
- Ports the miner catalog + dynamic pricing curve from v6:
  - `MinerType[]`, `currentPrice(id)`, `buyMiner(id) payable`
  - Per-wallet cap (100 units), `PRICE_CURVE_BPS` = 12500, `PRICE_CAP` = 40
- `accrue(user)` uses `oracle.getEmission()`
- `claim()`:
  - Blocks if `risk.isBlocked(msg.sender)`
  - Payout = `min(pending, treasury.availableRewards())` (LFR minted 1:1 against reserved native)
  - Calls `treasury.consume(amount)` then `token.mint(msg.sender, amount)`
- `buyMiner()` forwards `msg.value` to `treasury.deposit{value: ...}()`, adds power, refreshes oracle TVL + user count, calls `risk.updateScore`
- 3-second `COOLDOWN`, `Pausable` for buy/claim
- `_authorizeUpgrade` → `onlyOwner`
- Views: `getPlayer`, `getMiner`, `minersCount`, `playersCount`, `playerList`, `totalPower`, `calculateRewards`

**`V3Proxy.sol`** — ERC1967Proxy wrapper (thin, for deploy convenience)

Hardening added on top of user's snippets:
- `onlyCore` / `onlyMinter` modifiers everywhere
- ReentrancyGuard on state-changing Core methods
- Custom errors instead of strings for gas
- Events on all critical mutations

### 2. Deploy script (`contracts/scripts/deploy-v3.ts`)

Hardhat script (uses `hardhat`, `@openzeppelin/hardhat-upgrades`):
1. Deploy `RewardToken`
2. Deploy `TreasuryVault`
3. Deploy `RiskEngine`
4. Deploy `EmissionOracle`
5. Deploy `V3MiningCore` via `upgrades.deployProxy(..., { kind: 'uups' })` with initializer args
6. Wire: `token.setMinter(core)`, `treasury.setCore(core)`, `risk.setCore(core)`, `oracle.setCore(core)`
7. Print all 5 addresses (Core proxy + 4 modules) for `.env` / `contract.ts`

Also adds `contracts/hardhat.config.ts`, `contracts/package.json`, and a `contracts/README.md` with deploy commands for LiteForge Testnet (chain 4441).

### 3. UI refactor

**`src/lib/contract.ts`** — replaced entirely
- Export 5 addresses: `CORE_ADDRESS`, `TOKEN_ADDRESS`, `TREASURY_ADDRESS`, `RISK_ADDRESS`, `ORACLE_ADDRESS` (env-driven with placeholders)
- Export 5 ABIs: `CORE_ABI`, `TOKEN_ABI`, `TREASURY_ABI`, `RISK_ABI`, `ORACLE_ABI`

**`src/lib/onchain.ts`** — full rewrite around V3
- `usePoolInfo()` reads from `TreasuryVault` (rewardPool, reservePool, devPool) + `EmissionOracle.getEmission()` + `EmissionOracle.capTVL`
- New `useLfrBalance()` → user's LFR balance via `TOKEN_ABI.balanceOf`
- `useMiners()`, `usePlayer()`, `usePendingRewards()`, `useLeaderboard()` → point at `CORE_ADDRESS`
- New `useRiskScore()` → `RiskEngine.score(user)` + `isBlocked`
- `useWhaleShare` stays but reads `totalPower` from Core
- `useIsAdmin` → checks Core `owner()`

**Route updates (presentation-only wiring, no logic rewrite):**
- `src/routes/index.tsx` — dual-currency header: native zkLTC balance + LFR balance; "Pending" shown in LFR; existing PoolHealth wired to Vault
- `src/routes/dashboard.tsx` — adds "LFR earned (lifetime)" card, "Risk score X/100" chip, split treasury display (Reward / Reserve / Dev)
- `src/routes/shop.tsx` — buy still uses `msg.value` (native), price display unchanged; adds "reward paid in LFR" hint
- `src/routes/admin.tsx` — new sections: Oracle tuning (base/min/capTVL setters), RiskEngine tuning (maxScore/thresholds), Treasury `withdrawDev`, contract upgrade helper (shows proxy + current implementation)
- `src/routes/leaderboard.tsx` — "lifetimeRewards" column now labeled LFR; adds "Risk" column

### 4. Files touched

```text
NEW  contracts/v3/RewardToken.sol
NEW  contracts/v3/TreasuryVault.sol
NEW  contracts/v3/RiskEngine.sol
NEW  contracts/v3/EmissionOracle.sol
NEW  contracts/v3/V3MiningCore.sol
NEW  contracts/v3/V3Proxy.sol
NEW  contracts/scripts/deploy-v3.ts
NEW  contracts/hardhat.config.ts
NEW  contracts/package.json
EDIT contracts/README.md
DEL  contracts/MiningManager.sol
EDIT src/lib/contract.ts        (5 addrs + 5 ABIs)
EDIT src/lib/onchain.ts         (multi-contract hooks)
EDIT src/routes/index.tsx       (dual currency)
EDIT src/routes/dashboard.tsx   (LFR + risk + segmented treasury)
EDIT src/routes/shop.tsx        (LFR reward hint)
EDIT src/routes/admin.tsx       (oracle/risk/treasury/upgrade panels)
EDIT src/routes/leaderboard.tsx (LFR + risk column)
```

### Answers to your question

بله، همین UI میتونه اجراش کنه — ولی چون معماری از **یک قرارداد → پنج قرارداد** میره، تمام hookها و بخشی از هر صفحه بازنویسی میشه. deploy روی LiteForge باید خودت با اسکریپت Hardhat انجام بدی (این محیط قابلیت deploy مستقیم روی chain نداره)، بعد ۵ آدرس رو در `contract.ts` (یا env) بذاری تا UI به V3 وصل بشه.

**نکتهٔ مهم دربارهٔ اقتصاد دوگانه:** خرید native + پاداش LFR یعنی LFR فقط با mint چاپ میشه و پشتوانه‌اش zkLTC داخل TreasuryVault است. اگه بعداً بخوای LFR قابل redeem به zkLTC باشه، یک `redeem()` هم اضافه میکنم — الان در پلن نیست، بگو اگه لازمه.
