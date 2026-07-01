// Local simulation store that mirrors MiningManager.sol behavior 1:1.
// Each connected wallet has an isolated persisted state under localStorage.
// When you deploy the real contract, swap useMiningState() for wagmi reads.

import { useCallback, useEffect, useState } from "react";
import { MINERS, REWARD_POOL_BPS, TREASURY_BPS, WITHDRAW_THRESHOLD } from "./miners";

const DAY = 86_400;

export interface PlayerState {
  address: string;
  registered: boolean;
  totalInvested: number;
  lifetimeRewards: number;
  lastUpdate: number; // seconds
  pending: number;
  minerCounts: number[]; // parallel to MINERS
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

const POOL_KEY = "liteminer:pool:v1";
const PLAYER_KEY = (a: string) => `liteminer:player:${a.toLowerCase()}:v1`;

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function ratePerSecond(counts: number[]): number {
  return counts.reduce((acc, c, i) => acc + (c * MINERS[i].ratePerDay) / DAY, 0);
}

function loadPool(): PoolState {
  if (typeof window === "undefined")
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
  const raw = localStorage.getItem(POOL_KEY);
  if (!raw)
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
  return JSON.parse(raw);
}

function savePool(p: PoolState) {
  localStorage.setItem(POOL_KEY, JSON.stringify(p));
  window.dispatchEvent(new Event("liteminer:pool"));
}

function loadPlayer(a: string): PlayerState {
  if (typeof window === "undefined")
    return {
      address: a,
      registered: false,
      totalInvested: 0,
      lifetimeRewards: 0,
      lastUpdate: nowSec(),
      pending: 0,
      minerCounts: MINERS.map(() => 0),
    };
  const raw = localStorage.getItem(PLAYER_KEY(a));
  if (!raw)
    return {
      address: a,
      registered: false,
      totalInvested: 0,
      lifetimeRewards: 0,
      lastUpdate: nowSec(),
      pending: 0,
      minerCounts: MINERS.map(() => 0),
    };
  const p: PlayerState = JSON.parse(raw);
  // ensure length matches (new miner types added)
  while (p.minerCounts.length < MINERS.length) p.minerCounts.push(0);
  return p;
}

function savePlayer(p: PlayerState) {
  localStorage.setItem(PLAYER_KEY(p.address), JSON.stringify(p));
  window.dispatchEvent(new Event("liteminer:player:" + p.address.toLowerCase()));
}

function accrue(p: PlayerState): PlayerState {
  const rps = ratePerSecond(p.minerCounts);
  const now = nowSec();
  const dt = Math.max(0, now - p.lastUpdate);
  return { ...p, pending: p.pending + rps * dt, lastUpdate: now };
}

export function useMiningState(address?: string) {
  const [pool, setPool] = useState<PoolState>(() => loadPool());
  const [player, setPlayer] = useState<PlayerState | null>(() =>
    address ? loadPlayer(address) : null,
  );

  useEffect(() => {
    setPlayer(address ? loadPlayer(address) : null);
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

  // Ticking pending display
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const livePending = player
    ? player.pending + ratePerSecond(player.minerCounts) * (nowSec() - player.lastUpdate)
    : 0;

  const register = useCallback(() => {
    if (!address) return;
    const p = loadPlayer(address);
    if (p.registered) return;
    p.registered = true;
    p.lastUpdate = nowSec();
    savePlayer(p);
    const pool = loadPool();
    if (!pool.players.includes(address.toLowerCase())) {
      pool.players.push(address.toLowerCase());
      savePool(pool);
    }
  }, [address]);

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
      p.totalInvested += price;
      savePlayer(p);

      const rewardCut = (price * pool.rewardBps) / 10_000;
      const treasuryCut = price - rewardCut;
      pool.rewardPool += rewardCut;
      pool.treasury += treasuryCut;
      pool.totalDeposits += price;
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
    if (pool.rewardPool < p.pending) throw new Error("Insufficient reward pool");
    const amount = p.pending;
    p.pending = 0;
    p.lifetimeRewards += amount;
    savePlayer(p);
    pool.rewardPool -= amount;
    pool.totalDistributed += amount;
    savePool(pool);
  }, [address]);

  return {
    pool,
    player,
    livePending,
    ratePerSecond: player ? ratePerSecond(player.minerCounts) : 0,
    register,
    buyMiner,
    claim,
  };
}

// Leaderboard helper: enumerates all local players (mock of on-chain event scan).
export function useLeaderboard() {
  const [rows, setRows] = useState<PlayerState[]>([]);
  useEffect(() => {
    const load = () => {
      const pool = loadPool();
      setRows(pool.players.map(loadPlayer));
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
