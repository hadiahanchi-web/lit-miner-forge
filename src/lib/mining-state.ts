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
  minerLevels: number[]; // parallel; 0 = no rig, 1..MAX_LEVEL when owned
  // referrals
  referrer?: string;
  referrals: string[];
  referralEarnings: number;
  // missions
  missionsDate: string; // YYYY-MM-DD (UTC)
  missionsDone: MissionId[];
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

const POOL_KEY = "liteminer:pool:v2";
const PLAYER_KEY = (a: string) => `liteminer:player:${a.toLowerCase()}:v2`;

const nowSec = () => Math.floor(Date.now() / 1000);
const todayUTC = () => new Date().toISOString().slice(0, 10);

function ratePerSecond(counts: number[], levels: number[]): number {
  return counts.reduce((acc, c, i) => {
    if (c === 0) return acc;
    const mult = levelMultiplier(levels[i] || 1);
    return acc + (c * MINERS[i].ratePerDay * mult) / DAY;
  }, 0);
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
    referrals: [],
    referralEarnings: 0,
    missionsDate: todayUTC(),
    missionsDone: [],
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
  // extend arrays if new miner types were added
  while (p.minerCounts.length < MINERS.length) p.minerCounts.push(0);
  while (p.minerLevels.length < MINERS.length) p.minerLevels.push(0);
  // reset missions if new day
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

function accrue(p: PlayerState): PlayerState {
  const rps = ratePerSecond(p.minerCounts, p.minerLevels);
  const now = nowSec();
  const dt = Math.max(0, now - p.lastUpdate);
  return { ...p, pending: p.pending + rps * dt, lastUpdate: now };
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

  // 1s tick for live pending display
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const rps = player ? ratePerSecond(player.minerCounts, player.minerLevels) : 0;
  const livePending = player ? player.pending + rps * (nowSec() - player.lastUpdate) : 0;

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
        // Attach referral (once, never self)
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
      // Daily login mission
      const before = p.missionsDone.length;
      completeMission(p, "login", pool);
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
      const price = miner.price;
      let p = loadPlayer(address);
      if (!p.registered) {
        p.registered = true;
        if (!pool.players.includes(address.toLowerCase())) pool.players.push(address.toLowerCase());
      }
      p = accrue(p);
      p.minerCounts[minerId] += 1;
      if (p.minerLevels[minerId] === 0) p.minerLevels[minerId] = 1;
      p.totalInvested += price;

      const rewardCut = (price * pool.rewardBps) / 10_000;
      const treasuryCut = price - rewardCut;
      pool.rewardPool += rewardCut;
      pool.treasury += treasuryCut;
      pool.totalDeposits += price;

      // Referral bonus paid from treasury
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
      if (level === 0 || p.minerCounts[minerId] === 0)
        throw new Error("Buy this miner first");
      if (level >= MAX_LEVEL) throw new Error("Max level reached");
      const cost = upgradeCost(minerId, level);
      p = accrue(p);
      p.minerLevels[minerId] = level + 1;
      p.totalInvested += cost;
      const rewardCut = (cost * pool.rewardBps) / 10_000;
      pool.rewardPool += rewardCut;
      pool.treasury += cost - rewardCut;
      pool.totalDeposits += cost;
      completeMission(p, "upgrade", pool);
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
    p = accrue(p);
    if (p.pending < WITHDRAW_THRESHOLD)
      throw new Error(`Need ${WITHDRAW_THRESHOLD} zkLTC to withdraw`);
    // SAFETY: cap payout at whatever the pool can pay; never revert claims silently.
    const amount = Math.min(p.pending, pool.rewardPool);
    if (amount <= 0) throw new Error("Reward pool empty — try again later");
    p.pending -= amount;
    p.lifetimeRewards += amount;
    pool.rewardPool -= amount;
    pool.totalDistributed += amount;
    completeMission(p, "claim", pool);
    savePlayer(p);
    savePool(pool);
    return amount;
  }, [address]);

  return {
    pool,
    player,
    livePending,
    ratePerSecond: rps,
    register,
    buyMiner,
    upgradeMiner,
    claim,
  };
}

// Leaderboard helper: enumerates all local players (mock of an on-chain event scan).
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
          const power = ratePerSecond(p.minerCounts, p.minerLevels) * DAY;
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
