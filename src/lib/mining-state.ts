// Local simulation of the LiteMiner v4 protocol.
// Sustainable economy: daily reward budget, per-wallet epoch cap, wallet energy,
// miner durability + repair, action cooldowns, and efficiency-based leaderboard.

import { useCallback, useEffect, useState } from "react";
import {
  MINERS,
  REWARD_POOL_BPS,
  TREASURY_BPS,
  WITHDRAW_THRESHOLD,
  MAX_LEVEL,
  upgradeCost,
  levelMultiplier,
  REFERRAL_BPS,
  MISSION_REWARD,
  DAILY_LOGIN_REWARD,
  MAINTENANCE_FEE_BPS,
  poolHealth,
  emissionMultiplier,
  CHEST_MIN,
  CHEST_MAX,
  SPIN_SLOTS,
  ACHIEVEMENTS,
  EPOCH_SEC,
  DAILY_EMISSION_BPS,
  PER_WALLET_EPOCH_CAP_BPS,
  WALLET_ENERGY_MAX,
  WALLET_ENERGY_REGEN_PER_SEC,
  WALLET_ENERGY_DRAIN_PER_SEC,
  ENERGY_REFILL_COST_PER_UNIT,
  DURABILITY_MAX,
  REPAIR_COST_BPS,
  ACTION_COOLDOWN_SEC,
  CLAIMS_PER_EPOCH,
  durabilityDrainPerSec,
  tierEfficiency,
} from "./miners";

const DAY = EPOCH_SEC;

export type MissionId = "buy" | "upgrade" | "claim" | "login";
export const MISSION_LIST: {
  id: MissionId;
  label: string;
  description: string;
  reward: number;
}[] = [
  { id: "login", label: "Daily Login", description: "Visit the facility today.", reward: DAILY_LOGIN_REWARD },
  { id: "buy", label: "Buy a Miner", description: "Purchase any miner today.", reward: MISSION_REWARD },
  { id: "upgrade", label: "Upgrade a Miner", description: "Upgrade any miner by one level.", reward: MISSION_REWARD },
  { id: "claim", label: "Claim Rewards", description: "Withdraw pending zkLTC.", reward: MISSION_REWARD },
];

export interface PlayerState {
  address: string;
  registered: boolean;
  totalInvested: number;
  lifetimeRewards: number;
  lastUpdate: number; // seconds
  pending: number;
  minerCounts: number[];
  minerLevels: number[];
  /** Per-tier average durability 0..DURABILITY_MAX. */
  minerDurability: number[];
  // wallet energy
  walletEnergy: number;
  // uptime & anti-farm
  uptimeSec: number;         // seconds of productive mining accumulated
  lastActionAt: number;      // cooldown reference
  // per-epoch tracking
  epoch: number;             // floor(now / EPOCH_SEC)
  earnedThisEpoch: number;   // zkLTC minted from mining this epoch
  epochCap: number;          // snapshot cap for this epoch
  claimsThisEpoch: number;
  // referrals
  referrer?: string;
  referrals: string[];
  referralEarnings: number;
  // missions
  missionsDate: string;
  missionsDone: MissionId[];
  // daily engagement
  chestDate?: string;
  spinDate?: string;
  // stats
  totalUpgrades: number;
  totalClaims: number;
  totalRepairs: number;
  achievements: string[];
  // consistency
  activeDays: number;         // unique UTC days with any action
  lastActiveDate?: string;    // YYYY-MM-DD
  streakDays: number;         // consecutive active days
}


export interface PoolState {
  rewardPool: number;
  treasury: number;
  totalDeposits: number;
  totalDistributed: number;
  paused: boolean;
  withdrawPaused: boolean;
  rewardBps: number;
  treasuryBps: number;
  dailyEmissionBps: number;
  perWalletEpochCapBps: number;
  players: string[];
  // global epoch budget
  epoch: number;
  epochBudget: number;      // snapshot of pool * dailyEmissionBps at epoch start
  epochRemaining: number;   // decreases as mining pays out
}

const POOL_KEY = "liteminer:pool:v4";
const PLAYER_KEY = (a: string) => `liteminer:player:${a.toLowerCase()}:v4`;

const nowSec = () => Math.floor(Date.now() / 1000);
const todayUTC = () => new Date().toISOString().slice(0, 10);
const currentEpoch = () => Math.floor(nowSec() / EPOCH_SEC);

/** Nominal rate ignoring energy/durability/emissions/budget (used for "max rate"). */
function baseRatePerSecond(counts: number[], levels: number[]): number {
  return counts.reduce((acc, c, i) => {
    if (c === 0) return acc;
    const mult = levelMultiplier(levels[i] || 1);
    return acc + (c * MINERS[i].ratePerDay * mult) / DAY;
  }, 0);
}

/** Effective mining rate factoring in durability & wallet energy & pool-health throttle. */
function effectiveRatePerSecond(
  counts: number[],
  levels: number[],
  durability: number[],
  walletEnergy: number,
  pool: PoolState,
): number {
  const emission = emissionMultiplier(poolHealth(pool.rewardPool, pool.totalDeposits, pool.rewardBps));
  if (walletEnergy <= 0) return 0;
  // wallet energy soft-throttle: <25% → linear scale to 0
  const eNorm = Math.max(0, Math.min(1, walletEnergy / WALLET_ENERGY_MAX));
  const walletFactor = eNorm < 0.25 ? eNorm / 0.25 : 1;

  let total = 0;
  for (let i = 0; i < MINERS.length; i++) {
    if (counts[i] === 0) continue;
    const mult = levelMultiplier(levels[i] || 1);
    const d = Math.max(0, Math.min(DURABILITY_MAX, durability[i] ?? DURABILITY_MAX));
    const dFactor = d <= 0 ? 0 : d < 25 ? d / 25 : 1;
    total += (counts[i] * MINERS[i].ratePerDay * mult * dFactor) / DAY;
  }
  return total * emission * walletFactor;
}

function emptyPool(): PoolState {
  return {
    rewardPool: 0,
    treasury: 0,
    totalDeposits: 0,
    totalDistributed: 0,
    paused: false,
    withdrawPaused: false,
    rewardBps: REWARD_POOL_BPS,
    treasuryBps: TREASURY_BPS,
    dailyEmissionBps: DAILY_EMISSION_BPS,
    perWalletEpochCapBps: PER_WALLET_EPOCH_CAP_BPS,
    players: [],
    epoch: currentEpoch(),
    epochBudget: 0,
    epochRemaining: 0,
  };
}

function emptyPlayer(a: string): PlayerState {
  return {
    address: a,
    registered: false,
    totalInvested: 0,
    lifetimeRewards: 0,
    lastUpdate: nowSec(),
    pending: 0,
    minerCounts: MINERS.map(() => 0),
    minerLevels: MINERS.map(() => 0),
    minerDurability: MINERS.map(() => DURABILITY_MAX),
    walletEnergy: WALLET_ENERGY_MAX,
    uptimeSec: 0,
    lastActionAt: 0,
    epoch: currentEpoch(),
    earnedThisEpoch: 0,
    epochCap: 0,
    claimsThisEpoch: 0,
    referrals: [],
    referralEarnings: 0,
    missionsDate: todayUTC(),
    missionsDone: [],
    totalUpgrades: 0,
    totalClaims: 0,
    totalRepairs: 0,
    achievements: [],
    activeDays: 0,
    streakDays: 0,

  };
}

function loadPool(): PoolState {
  if (typeof window === "undefined") return emptyPool();
  const raw = localStorage.getItem(POOL_KEY);
  if (!raw) return emptyPool();
  try {
    return { ...emptyPool(), ...JSON.parse(raw) };
  } catch {
    return emptyPool();
  }
}
function savePool(p: PoolState) {
  localStorage.setItem(POOL_KEY, JSON.stringify(p));
  window.dispatchEvent(new Event("liteminer:pool"));
}

function loadPlayer(a: string): PlayerState {
  if (typeof window === "undefined") return emptyPlayer(a);
  const raw = localStorage.getItem(PLAYER_KEY(a));
  if (!raw) return emptyPlayer(a);
  let p: PlayerState;
  try {
    p = { ...emptyPlayer(a), ...JSON.parse(raw) };
  } catch {
    return emptyPlayer(a);
  }
  while (p.minerCounts.length < MINERS.length) p.minerCounts.push(0);
  while (p.minerLevels.length < MINERS.length) p.minerLevels.push(0);
  while (p.minerDurability.length < MINERS.length) p.minerDurability.push(DURABILITY_MAX);
  if (p.missionsDate !== todayUTC()) {
    p.missionsDate = todayUTC();
    p.missionsDone = [];
  }
  return p;
}
function savePlayer(p: PlayerState) {
  localStorage.setItem(PLAYER_KEY(p.address), JSON.stringify(p));
  window.dispatchEvent(new Event("liteminer:player:" + p.address.toLowerCase()));
}

/** Reset global epoch budget on epoch rollover. Snapshots budget from current pool. */
function rollPoolEpoch(pool: PoolState) {
  const ep = currentEpoch();
  if (ep !== pool.epoch) {
    pool.epoch = ep;
    pool.epochBudget = (pool.rewardPool * pool.dailyEmissionBps) / 10_000;
    pool.epochRemaining = pool.epochBudget;
  } else if (pool.epochBudget === 0 && pool.rewardPool > 0) {
    // first-ever init
    pool.epochBudget = (pool.rewardPool * pool.dailyEmissionBps) / 10_000;
    pool.epochRemaining = pool.epochBudget;
  }
}

/** Reset player-epoch tracking + snapshot per-wallet cap from current pool budget. */
function rollPlayerEpoch(p: PlayerState, pool: PoolState) {
  const ep = currentEpoch();
  if (ep !== p.epoch) {
    p.epoch = ep;
    p.earnedThisEpoch = 0;
    p.claimsThisEpoch = 0;
    p.epochCap = (pool.epochBudget * pool.perWalletEpochCapBps) / 10_000;
  } else if (p.epochCap === 0 && pool.epochBudget > 0) {
    p.epochCap = (pool.epochBudget * pool.perWalletEpochCapBps) / 10_000;
  }
}

/** Accrue rewards + drain/regen energy + drain durability since lastUpdate. */
function accrue(p: PlayerState, pool: PoolState): PlayerState {
  rollPoolEpoch(pool);
  rollPlayerEpoch(p, pool);

  const now = nowSec();
  const dt = Math.max(0, now - p.lastUpdate);
  if (dt === 0) return p;

  const hasFleet = p.minerCounts.some((c) => c > 0);
  const rps = effectiveRatePerSecond(p.minerCounts, p.minerLevels, p.minerDurability, p.walletEnergy, pool);

  // Reward = rps * dt but capped by per-wallet epoch cap AND global epoch budget
  let reward = rps * dt;
  const capRemainWallet = Math.max(0, p.epochCap - p.earnedThisEpoch);
  reward = Math.min(reward, capRemainWallet, pool.epochRemaining);
  reward = Math.max(0, reward);
  p.pending += reward;
  p.earnedThisEpoch += reward;
  pool.epochRemaining = Math.max(0, pool.epochRemaining - reward);

  // Uptime: seconds during which we actually paid out something
  if (reward > 0) p.uptimeSec += dt;

  // Wallet energy: drain while mining, regen while idle (or capped)
  if (hasFleet && rps > 0) {
    p.walletEnergy = Math.max(0, p.walletEnergy - WALLET_ENERGY_DRAIN_PER_SEC * dt);
  } else {
    p.walletEnergy = Math.min(WALLET_ENERGY_MAX, p.walletEnergy + WALLET_ENERGY_REGEN_PER_SEC * dt);
  }

  // Miner durability: drain proportional to fleet activity (only when producing)
  if (rps > 0) {
    for (let i = 0; i < MINERS.length; i++) {
      if (p.minerCounts[i] === 0) continue;
      p.minerDurability[i] = Math.max(0, (p.minerDurability[i] ?? DURABILITY_MAX) - durabilityDrainPerSec(i) * dt);
    }
  }

  p.lastUpdate = now;
  return p;
}

function completeMission(p: PlayerState, id: MissionId, pool: PoolState): PlayerState {
  if (p.missionsDone.includes(id)) return p;
  const mission = MISSION_LIST.find((m) => m.id === id)!;
  const bonus = Math.min(mission.reward, pool.treasury);
  p.missionsDone = [...p.missionsDone, id];
  if (bonus > 0) {
    p.pending += bonus;
    pool.treasury -= bonus;
  }
  return p;
}

function grantAchievements(p: PlayerState, pool: PoolState): PlayerState {
  const totalMiners = p.minerCounts.reduce((a, b) => a + b, 0);
  const ctx = {
    totalMiners,
    totalUpgrades: p.totalUpgrades,
    totalClaims: p.totalClaims,
    invested: p.totalInvested,
    referrals: p.referrals.length,
  };
  for (const a of ACHIEVEMENTS) {
    if (p.achievements.includes(a.id)) continue;
    if (!a.check(ctx)) continue;
    const bonus = Math.min(a.reward, pool.treasury);
    if (bonus > 0) {
      p.pending += bonus;
      pool.treasury -= bonus;
    }
    p.achievements = [...p.achievements, a.id];
  }
  return p;
}

export function isMinerUnlocked(minerId: number, player: PlayerState | null): boolean {
  const u = MINERS[minerId].unlock;
  if (!u.requiresMinerId && !u.minInvested) return true;
  if (!player) return !u.requiresMinerId && !u.minInvested;
  if (u.requiresMinerId !== undefined && (player.minerCounts[u.requiresMinerId] ?? 0) > 0) return true;
  if (u.minInvested !== undefined && player.totalInvested >= u.minInvested) return true;
  return false;
}

/** Enforce anti-bot cooldown between mutating actions. */
function assertCooldown(p: PlayerState) {
  const dt = nowSec() - p.lastActionAt;
  if (dt < ACTION_COOLDOWN_SEC) {
    throw new Error(`Cooldown: wait ${ACTION_COOLDOWN_SEC - dt}s before next action`);
  }
}

function stamp(p: PlayerState) {
  p.lastActionAt = nowSec();
  const today = todayUTC();
  if (p.lastActiveDate !== today) {
    // increment streak if yesterday, else reset to 1
    if (p.lastActiveDate) {
      const prev = new Date(p.lastActiveDate + "T00:00:00Z").getTime();
      const cur = new Date(today + "T00:00:00Z").getTime();
      const diffDays = Math.round((cur - prev) / 86_400_000);
      p.streakDays = diffDays === 1 ? p.streakDays + 1 : 1;
    } else {
      p.streakDays = 1;
    }
    p.activeDays += 1;
    p.lastActiveDate = today;
  }
}


/** Split a fee into the 70/30 pool/treasury sinks. */
function ingestFee(pool: PoolState, amount: number) {
  const toPool = (amount * pool.rewardBps) / 10_000;
  pool.rewardPool += toPool;
  pool.treasury += amount - toPool;
  pool.totalDeposits += amount;
}

export function useMiningState(address?: string) {
  const [pool, setPool] = useState<PoolState>(() => loadPool());
  const [player, setPlayer] = useState<PlayerState | null>(() =>
    address ? loadPlayer(address) : null,
  );

  useEffect(() => {
    setPlayer(address ? loadPlayer(address) : null);
    setPool(loadPool());
  }, [address]);

  useEffect(() => {
    const onPool = () => setPool(loadPool());
    const onPlayer = () => address && setPlayer(loadPlayer(address));
    window.addEventListener("liteminer:pool", onPool);
    if (address) window.addEventListener("liteminer:player:" + address.toLowerCase(), onPlayer);
    return () => {
      window.removeEventListener("liteminer:pool", onPool);
      if (address)
        window.removeEventListener("liteminer:player:" + address.toLowerCase(), onPlayer);
    };
  }, [address]);

  // 1s tick
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const baseRps = player ? baseRatePerSecond(player.minerCounts, player.minerLevels) : 0;
  const effRps = player ? effectiveRatePerSecond(player.minerCounts, player.minerLevels, player.minerDurability, player.walletEnergy, pool) : 0;
  const health = poolHealth(pool.rewardPool, pool.totalDeposits, pool.rewardBps);
  const emission = emissionMultiplier(health);
  const capRemain = player ? Math.max(0, player.epochCap - player.earnedThisEpoch) : 0;
  const budgetProjected = Math.min(effRps * (nowSec() - (player?.lastUpdate ?? nowSec())), capRemain, pool.epochRemaining);
  const livePending = player ? player.pending + Math.max(0, budgetProjected) : 0;

  const register = useCallback(
    (referrer?: string) => {
      if (!address) return;
      const pool = loadPool();
      rollPoolEpoch(pool);
      const p = loadPlayer(address);
      let dirty = false;
      if (!p.registered) {
        p.registered = true;
        p.lastUpdate = nowSec();
        rollPlayerEpoch(p, pool);
        dirty = true;
        if (!pool.players.includes(address.toLowerCase())) {
          pool.players.push(address.toLowerCase());
        }
        if (
          referrer &&
          /^0x[a-fA-F0-9]{40}$/.test(referrer) &&
          referrer.toLowerCase() !== address.toLowerCase()
        ) {
          p.referrer = referrer.toLowerCase();
          const ref = loadPlayer(referrer);
          if (!ref.referrals.includes(address.toLowerCase())) {
            ref.referrals.push(address.toLowerCase());
            savePlayer(ref);
          }
        }
      }
      const before = p.missionsDone.length;
      completeMission(p, "login", pool);
      grantAchievements(p, pool);
      if (dirty || p.missionsDone.length !== before) {
        savePlayer(p);
        savePool(pool);
      }
    },
    [address],
  );

  const buyMiner = useCallback(
    (minerId: number) => {
      if (!address) throw new Error("Wallet not connected");
      const pool = loadPool();
      if (pool.paused) throw new Error("Mining paused");
      const miner = MINERS[minerId];
      let p = loadPlayer(address);
      assertCooldown(p);
      if (!isMinerUnlocked(minerId, p)) throw new Error(`Locked: ${miner.unlock.label}`);
      const price = miner.price;
      if (!p.registered) {
        p.registered = true;
        if (!pool.players.includes(address.toLowerCase())) pool.players.push(address.toLowerCase());
      }
      p = accrue(p, pool);
      p.minerCounts[minerId] += 1;
      if (p.minerLevels[minerId] === 0) p.minerLevels[minerId] = 1;
      p.minerDurability[minerId] = DURABILITY_MAX; // fresh rig
      p.totalInvested += price;
      ingestFee(pool, price);

      if (p.referrer) {
        const bonus = (price * REFERRAL_BPS) / 10_000;
        const paid = Math.min(bonus, pool.treasury);
        if (paid > 0) {
          pool.treasury -= paid;
          const ref = loadPlayer(p.referrer);
          ref.referralEarnings += paid;
          ref.pending += paid;
          savePlayer(ref);
        }
      }

      completeMission(p, "buy", pool);
      grantAchievements(p, pool);
      stamp(p);
      savePlayer(p);
      savePool(pool);
    },
    [address],
  );

  const upgradeMiner = useCallback(
    (minerId: number) => {
      if (!address) throw new Error("Wallet not connected");
      const pool = loadPool();
      if (pool.paused) throw new Error("Mining paused");
      let p = loadPlayer(address);
      assertCooldown(p);
      const level = p.minerLevels[minerId] || 0;
      if (level === 0 || p.minerCounts[minerId] === 0) throw new Error("Buy this miner first");
      if (level >= MAX_LEVEL) throw new Error("Max level reached");
      const cost = upgradeCost(minerId, level);
      p = accrue(p, pool);
      p.minerLevels[minerId] = level + 1;
      p.totalInvested += cost;
      p.totalUpgrades += 1;
      ingestFee(pool, cost);
      completeMission(p, "upgrade", pool);
      grantAchievements(p, pool);
      stamp(p);
      savePlayer(p);
      savePool(pool);
    },
    [address],
  );

  const claim = useCallback(() => {
    if (!address) throw new Error("Wallet not connected");
    const pool = loadPool();
    if (pool.withdrawPaused) throw new Error("Withdrawals paused");
    let p = loadPlayer(address);
    assertCooldown(p);
    p = accrue(p, pool);
    if (p.walletEnergy <= 0) throw new Error("No wallet energy — refill to claim");
    if (p.claimsThisEpoch >= CLAIMS_PER_EPOCH) {
      throw new Error(`Only ${CLAIMS_PER_EPOCH} claim per 24h epoch — try tomorrow`);
    }
    if (p.pending < WITHDRAW_THRESHOLD)
      throw new Error(`Need ${WITHDRAW_THRESHOLD} zkLTC to withdraw`);

    // Cap payout at pool balance and at remaining daily budget
    const gross = Math.min(p.pending, pool.rewardPool);
    if (gross <= 0) throw new Error("Reward pool empty — try again later");
    const fee = (gross * MAINTENANCE_FEE_BPS) / 10_000;
    const net = gross - fee;
    p.pending -= gross;
    p.lifetimeRewards += net;
    p.totalClaims += 1;
    p.claimsThisEpoch += 1;
    pool.rewardPool -= gross;
    pool.treasury += fee;
    pool.totalDistributed += net;
    completeMission(p, "claim", pool);
    grantAchievements(p, pool);
    stamp(p);
    savePlayer(p);
    savePool(pool);
    return { net, fee };
  }, [address]);

  /** Repair all miner tiers to full durability. Cost = missing units * REPAIR_COST_BPS%. */
  const repairAll = useCallback(() => {
    if (!address) throw new Error("Wallet not connected");
    const pool = loadPool();
    let p = loadPlayer(address);
    assertCooldown(p);
    p = accrue(p, pool);
    let cost = 0;
    for (let i = 0; i < MINERS.length; i++) {
      if (p.minerCounts[i] > 0 && p.minerDurability[i] < DURABILITY_MAX) {
        const missing = DURABILITY_MAX - p.minerDurability[i];
        const fracOfFull = missing / DURABILITY_MAX;
        // 20% of price for a full repair, per rig
        cost += p.minerCounts[i] * MINERS[i].price * (REPAIR_COST_BPS / 10_000) * DURABILITY_MAX * fracOfFull;
        p.minerDurability[i] = DURABILITY_MAX;
      }
    }
    if (cost <= 0) throw new Error("All rigs are in mint condition");
    p.totalInvested += cost;
    p.totalRepairs += 1;
    ingestFee(pool, cost);
    stamp(p);
    savePlayer(p);
    savePool(pool);
    return cost;
  }, [address]);

  /** Refill wallet energy to 100%. Cost per unit = ENERGY_REFILL_COST_PER_UNIT zkLTC. */
  const refillEnergy = useCallback(() => {
    if (!address) throw new Error("Wallet not connected");
    const pool = loadPool();
    let p = loadPlayer(address);
    assertCooldown(p);
    p = accrue(p, pool);
    const missing = WALLET_ENERGY_MAX - p.walletEnergy;
    if (missing <= 0) throw new Error("Wallet energy already full");
    const cost = missing * ENERGY_REFILL_COST_PER_UNIT;
    p.walletEnergy = WALLET_ENERGY_MAX;
    p.totalInvested += cost;
    ingestFee(pool, cost);
    stamp(p);
    savePlayer(p);
    savePool(pool);
    return cost;
  }, [address]);

  const openChest = useCallback(() => {
    if (!address) throw new Error("Wallet not connected");
    const pool = loadPool();
    const p = loadPlayer(address);
    if (p.chestDate === todayUTC()) throw new Error("Chest already opened today");
    const roll = Math.random();
    const amount = +(CHEST_MIN + roll * (CHEST_MAX - CHEST_MIN)).toFixed(6);
    const paid = Math.min(amount, pool.treasury);
    p.chestDate = todayUTC();
    if (paid > 0) {
      pool.treasury -= paid;
      p.pending += paid;
    }
    savePlayer(p);
    savePool(pool);
    return paid;
  }, [address]);

  const spin = useCallback(() => {
    if (!address) throw new Error("Wallet not connected");
    const pool = loadPool();
    const p = loadPlayer(address);
    if (p.spinDate === todayUTC()) throw new Error("Spin already used today");
    const total = SPIN_SLOTS.reduce((s, o) => s + o.weight, 0);
    let roll = Math.random() * total;
    let pick = SPIN_SLOTS[0];
    for (const o of SPIN_SLOTS) {
      roll -= o.weight;
      if (roll <= 0) {
        pick = o;
        break;
      }
    }
    const paid = Math.min(pick.amount, pool.treasury);
    p.spinDate = todayUTC();
    if (paid > 0) {
      pool.treasury -= paid;
      p.pending += paid;
    }
    savePlayer(p);
    savePool(pool);
    return { label: pick.label, amount: paid };
  }, [address]);

  return {
    pool,
    player,
    livePending,
    baseRatePerSecond: baseRps,
    ratePerSecond: effRps,
    poolHealth: health,
    emissionMultiplier: emission,
    epochCapRemaining: capRemain,
    epochBudgetRemaining: pool.epochRemaining,
    epochBudget: pool.epochBudget,
    register,
    buyMiner,
    upgradeMiner,
    claim,
    repairAll,
    refillEnergy,
    openChest,
    spin,
  };
}

// Leaderboard — v4 metrics: efficiency (rewards/invested), uptime, lifetime, invested
export interface LeaderRow extends PlayerState {
  power: number;
  minerCount: number;
  efficiencyPct: number; // lifetimeRewards / totalInvested
  avgHwEfficiency: number;
}
export function useLeaderboard(): LeaderRow[] {
  const [rows, setRows] = useState<LeaderRow[]>([]);
  useEffect(() => {
    const load = () => {
      const pool = loadPool();
      setRows(
        pool.players.map((a) => {
          const p = loadPlayer(a);
          const minerCount = p.minerCounts.reduce((s, n) => s + n, 0);
          const power = baseRatePerSecond(p.minerCounts, p.minerLevels) * DAY;
          const efficiencyPct = p.totalInvested > 0 ? (p.lifetimeRewards / p.totalInvested) * 100 : 0;
          // weighted hw efficiency
          let sum = 0;
          for (let i = 0; i < MINERS.length; i++) sum += (p.minerCounts[i] || 0) * tierEfficiency(i);
          const avgHwEfficiency = minerCount > 0 ? sum / minerCount : 0;
          return { ...p, minerCount, power, efficiencyPct, avgHwEfficiency };
        }),
      );
    };
    load();
    const id = setInterval(load, 3000);
    return () => clearInterval(id);
  }, []);
  return rows;
}

// Admin helpers
export function adminUpdate(update: Partial<PoolState>) {
  const p = { ...loadPool(), ...update };
  savePool(p);
}
export function adminReadPool(): PoolState {
  return loadPool();
}
export function adminFundPool(amount: number) {
  const p = loadPool();
  p.rewardPool += amount;
  // re-snapshot epoch budget so operator sees immediate effect
  p.epochBudget = (p.rewardPool * p.dailyEmissionBps) / 10_000;
  p.epochRemaining = Math.max(p.epochRemaining, p.epochBudget);
  savePool(p);
}
