// Local simulation store that mirrors MiningManager.sol behavior.
// Each wallet has an isolated persisted state under localStorage.
// Swap useMiningState() for wagmi reads once the contract is deployed.

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
} from "./miners";

const DAY = 86_400;

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
  /** Per-tier energy (0..capacity). Drains while active, regens when idle. */
  minerEnergy: number[];
  // referrals
  referrer?: string;
  referrals: string[];
  referralEarnings: number;
  // missions
  missionsDate: string; // YYYY-MM-DD (UTC)
  missionsDone: MissionId[];
  // daily engagement
  chestDate?: string;
  spinDate?: string;
  // stats for achievements
  totalUpgrades: number;
  totalClaims: number;
  achievements: string[]; // claimed ids
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
  players: string[];
}

const POOL_KEY = "liteminer:pool:v3";
const PLAYER_KEY = (a: string) => `liteminer:player:${a.toLowerCase()}:v3`;

const nowSec = () => Math.floor(Date.now() / 1000);
const todayUTC = () => new Date().toISOString().slice(0, 10);

/** Base rate ignoring energy/emissions (used to display "max rate"). */
function baseRatePerSecond(counts: number[], levels: number[]): number {
  return counts.reduce((acc, c, i) => {
    if (c === 0) return acc;
    const mult = levelMultiplier(levels[i] || 1);
    return acc + (c * MINERS[i].ratePerDay * mult) / DAY;
  }, 0);
}

/** Effective rate = base × emission (pool health) × mean energy factor. */
function effectiveRatePerSecond(
  counts: number[],
  levels: number[],
  energy: number[],
  pool: PoolState,
): number {
  const emission = emissionMultiplier(poolHealth(pool.rewardPool, pool.totalDeposits, pool.rewardBps));
  let total = 0;
  for (let i = 0; i < MINERS.length; i++) {
    if (counts[i] === 0) continue;
    const mult = levelMultiplier(levels[i] || 1);
    // 0 energy → miner offline; scales linearly under 25%
    const eNorm = Math.max(0, Math.min(1, (energy[i] ?? MINERS[i].energyCapacity) / MINERS[i].energyCapacity));
    const eFactor = eNorm <= 0 ? 0 : eNorm < 0.25 ? eNorm / 0.25 : 1;
    total += (counts[i] * MINERS[i].ratePerDay * mult * eFactor) / DAY;
  }
  return total * emission;
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
    players: [],
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
    minerEnergy: MINERS.map((m) => m.energyCapacity),
    referrals: [],
    referralEarnings: 0,
    missionsDate: todayUTC(),
    missionsDone: [],
    totalUpgrades: 0,
    totalClaims: 0,
    achievements: [],
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
  while (p.minerEnergy.length < MINERS.length) p.minerEnergy.push(MINERS[p.minerEnergy.length].energyCapacity);
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

/** Accrue rewards + drain/regen energy since lastUpdate. */
function accrue(p: PlayerState, pool: PoolState): PlayerState {
  const now = nowSec();
  const dt = Math.max(0, now - p.lastUpdate);
  if (dt === 0) return p;
  const rps = effectiveRatePerSecond(p.minerCounts, p.minerLevels, p.minerEnergy, pool);
  const next = { ...p, pending: p.pending + rps * dt, lastUpdate: now };
  // update energy per tier
  next.minerEnergy = p.minerEnergy.map((e, i) => {
    const cap = MINERS[i].energyCapacity;
    if (p.minerCounts[i] === 0) return cap;
    const drain = MINERS[i].energyDrainPerSec * dt;
    return Math.max(0, Math.min(cap, e - drain));
  });
  return next;
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
  const effRps = player ? effectiveRatePerSecond(player.minerCounts, player.minerLevels, player.minerEnergy, pool) : 0;
  const livePending = player ? player.pending + effRps * (nowSec() - player.lastUpdate) : 0;
  const health = poolHealth(pool.rewardPool, pool.totalDeposits, pool.rewardBps);
  const emission = emissionMultiplier(health);

  const register = useCallback(
    (referrer?: string) => {
      if (!address) return;
      const pool = loadPool();
      const p = loadPlayer(address);
      let dirty = false;
      if (!p.registered) {
        p.registered = true;
        p.lastUpdate = nowSec();
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
      if (!isMinerUnlocked(minerId, p)) throw new Error(`Locked: ${miner.unlock.label}`);
      const price = miner.price;
      if (!p.registered) {
        p.registered = true;
        if (!pool.players.includes(address.toLowerCase())) pool.players.push(address.toLowerCase());
      }
      p = accrue(p, pool);
      p.minerCounts[minerId] += 1;
      if (p.minerLevels[minerId] === 0) p.minerLevels[minerId] = 1;
      p.minerEnergy[minerId] = miner.energyCapacity; // fresh rig is fully charged
      p.totalInvested += price;

      const rewardCut = (price * pool.rewardBps) / 10_000;
      const treasuryCut = price - rewardCut;
      pool.rewardPool += rewardCut;
      pool.treasury += treasuryCut;
      pool.totalDeposits += price;

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
      const level = p.minerLevels[minerId] || 0;
      if (level === 0 || p.minerCounts[minerId] === 0) throw new Error("Buy this miner first");
      if (level >= MAX_LEVEL) throw new Error("Max level reached");
      const cost = upgradeCost(minerId, level);
      p = accrue(p, pool);
      p.minerLevels[minerId] = level + 1;
      p.totalInvested += cost;
      p.totalUpgrades += 1;
      const rewardCut = (cost * pool.rewardBps) / 10_000;
      pool.rewardPool += rewardCut;
      pool.treasury += cost - rewardCut;
      pool.totalDeposits += cost;
      completeMission(p, "upgrade", pool);
      grantAchievements(p, pool);
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
    p = accrue(p, pool);
    if (p.pending < WITHDRAW_THRESHOLD)
      throw new Error(`Need ${WITHDRAW_THRESHOLD} zkLTC to withdraw`);
    // Cap payout at pool balance so tx never reverts on depletion
    const gross = Math.min(p.pending, pool.rewardPool);
    if (gross <= 0) throw new Error("Reward pool empty — try again later");
    // Maintenance fee: 5% of the claim returns to treasury (energy cost).
    const fee = (gross * MAINTENANCE_FEE_BPS) / 10_000;
    const net = gross - fee;
    p.pending -= gross;
    p.lifetimeRewards += net;
    p.totalClaims += 1;
    pool.rewardPool -= gross;
    pool.treasury += fee;
    pool.totalDistributed += net;
    completeMission(p, "claim", pool);
    grantAchievements(p, pool);
    savePlayer(p);
    savePool(pool);
    return { net, fee };
  }, [address]);

  const rechargeAll = useCallback(() => {
    if (!address) throw new Error("Wallet not connected");
    const pool = loadPool();
    let p = loadPlayer(address);
    p = accrue(p, pool);
    // Cost = 0.5% of price per unit for each tier fully recharged
    let cost = 0;
    for (let i = 0; i < MINERS.length; i++) {
      if (p.minerCounts[i] > 0 && p.minerEnergy[i] < MINERS[i].energyCapacity) {
        const missing = MINERS[i].energyCapacity - p.minerEnergy[i];
        const frac = missing / MINERS[i].energyCapacity;
        cost += p.minerCounts[i] * MINERS[i].price * 0.005 * frac;
        p.minerEnergy[i] = MINERS[i].energyCapacity;
      }
    }
    if (cost <= 0) throw new Error("All rigs are fully charged");
    p.totalInvested += cost;
    // 100% of recharge fee goes to treasury (energy = ops cost)
    pool.treasury += cost;
    pool.totalDeposits += cost;
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
    register,
    buyMiner,
    upgradeMiner,
    claim,
    rechargeAll,
    openChest,
    spin,
  };
}

// Leaderboard
export interface LeaderRow extends PlayerState {
  power: number;
  minerCount: number;
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
          return { ...p, minerCount, power };
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
  savePool(p);
}
