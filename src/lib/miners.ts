import type { LucideIcon } from "lucide-react";
import { Usb, Cpu, HardDrive, Microchip, Atom, Flame } from "lucide-react";

export interface MinerType {
  id: number;
  name: string;
  price: number; // zkLTC
  ratePerDay: number; // zkLTC / day at level 1
  color: string;
  accent: string;
  description: string;
  tier: "usb" | "starter" | "gpu" | "asic" | "quantum" | "fusion";
  icon: LucideIcon;
  symbol: string;
  /** Player-level unlock: previous tier must be owned OR minInvested reached. */
  unlock: { requiresMinerId?: number; minInvested?: number; label: string };
  /** Energy capacity per unit; drains while running, regens when idle. */
  energyCapacity: number;
  /** Energy drain per second per unit while active. */
  energyDrainPerSec: number;
}

// Order matters: IDs are used on-chain. New tiers must append.
export const MINERS: MinerType[] = [
  {
    id: 0,
    name: "Basic USB Miner",
    price: 0.01,
    ratePerDay: 0.0001,
    color: "#94a3b8",
    accent: "#64748b",
    tier: "usb",
    icon: Usb,
    symbol: "USB",
    description: "Onboarding rig. Plug in, learn the ropes, mine your first sats.",
    unlock: { label: "No requirement" },
    energyCapacity: 100,
    energyDrainPerSec: 100 / (24 * 3600), // full day of runtime
  },
  {
    id: 1,
    name: "Starter Miner",
    price: 1,
    ratePerDay: 0.01,
    color: "#38bdf8",
    accent: "#0ea5e9",
    tier: "starter",
    icon: HardDrive,
    symbol: "S1",
    description: "Reliable entry-level rig. Perfect for your first shaft.",
    unlock: { requiresMinerId: 0, label: "Own a Basic USB Miner" },
    energyCapacity: 100,
    energyDrainPerSec: 100 / (18 * 3600),
  },
  {
    id: 2,
    name: "GPU Miner",
    price: 10,
    ratePerDay: 0.12,
    color: "#22d3ee",
    accent: "#0891b2",
    tier: "gpu",
    icon: Cpu,
    symbol: "GPU",
    description: "Parallelized GPU array. Higher throughput, higher heat.",
    unlock: { requiresMinerId: 1, label: "Own a Starter Miner" },
    energyCapacity: 100,
    energyDrainPerSec: 100 / (12 * 3600),
  },
  {
    id: 3,
    name: "ASIC Miner",
    price: 50,
    ratePerDay: 0.7,
    color: "#f97316",
    accent: "#ea580c",
    tier: "asic",
    icon: Microchip,
    symbol: "ASIC",
    description: "Application-specific silicon tuned for zkLTC hashing.",
    unlock: { requiresMinerId: 2, label: "Own a GPU Miner" },
    energyCapacity: 100,
    energyDrainPerSec: 100 / (10 * 3600),
  },
  {
    id: 4,
    name: "Quantum Miner",
    price: 250,
    ratePerDay: 4,
    color: "#a855f7",
    accent: "#7c3aed",
    tier: "quantum",
    icon: Atom,
    symbol: "QTM",
    description: "Superposition-driven proofs. Cold, silent, devastating.",
    unlock: { requiresMinerId: 3, label: "Own an ASIC Miner" },
    energyCapacity: 100,
    energyDrainPerSec: 100 / (8 * 3600),
  },
  {
    id: 5,
    name: "Fusion Miner",
    price: 1000,
    ratePerDay: 20,
    color: "#f59e0b",
    accent: "#f97316",
    tier: "fusion",
    icon: Flame,
    symbol: "FUS",
    description: "Reactor-class rig. The apex of the LiteForge fleet.",
    unlock: { requiresMinerId: 4, label: "Own a Quantum Miner" },
    energyCapacity: 100,
    energyDrainPerSec: 100 / (6 * 3600),
  },
];

// Economics
export const WITHDRAW_THRESHOLD = 0.01; // zkLTC (testnet-friendly)
export const REWARD_POOL_BPS = 8000; // 80% of purchase → reward pool
export const TREASURY_BPS = 2000; // 20% → treasury
export const MAINTENANCE_FEE_BPS = 500; // 5% of every claim → treasury (energy cost)

// Upgrades — balanced exponential
export const MAX_LEVEL = 10;
/** Cost from L→L+1: 0.2 * price * 1.5^(level-1). L1→L2 = 0.2×, L9→L10 ≈ 5.1× */
export function upgradeCost(minerId: number, currentLevel: number): number {
  if (currentLevel <= 0 || currentLevel >= MAX_LEVEL) return Infinity;
  const base = MINERS[minerId].price;
  return +(base * 0.2 * Math.pow(1.5, currentLevel - 1)).toFixed(6);
}
/** Rate multiplier at level: +25% per level (1x at L1 → 3.25x at L10). */
export function levelMultiplier(level: number): number {
  return 1 + (Math.max(1, level) - 1) * 0.25;
}

// Dynamic emissions — reduce yield as pool depletes so it never runs dry
export function poolHealth(rewardPool: number, totalDeposits: number, rewardBps: number): number {
  const funded = Math.max(1e-9, (totalDeposits * rewardBps) / 10_000);
  return Math.max(0, Math.min(1, rewardPool / funded));
}
export function emissionMultiplier(health: number): number {
  if (health >= 0.6) return 1.0;
  if (health >= 0.4) return 0.75;
  if (health >= 0.2) return 0.5;
  if (health >= 0.1) return 0.25;
  if (health > 0) return 0.1;
  return 0;
}

// Referrals
export const REFERRAL_BPS = 500; // 5% of purchase → referrer

// Daily engagement
export const MISSION_REWARD = 0.02;
export const DAILY_LOGIN_REWARD = 0.005;
export const CHEST_MIN = 0.005;
export const CHEST_MAX = 0.05;
export const SPIN_SLOTS: { label: string; amount: number; weight: number }[] = [
  { label: "0.001", amount: 0.001, weight: 30 },
  { label: "0.005", amount: 0.005, weight: 25 },
  { label: "0.01", amount: 0.01, weight: 20 },
  { label: "0.025", amount: 0.025, weight: 12 },
  { label: "0.05", amount: 0.05, weight: 8 },
  { label: "0.1 ★", amount: 0.1, weight: 5 },
];

// Player level: sqrt(invested * 10), capped at 100.
export function playerLevel(invested: number): number {
  return Math.min(100, Math.floor(Math.sqrt(Math.max(0, invested) * 10)));
}

// Achievements catalogue
export interface Achievement {
  id: string;
  label: string;
  description: string;
  reward: number; // zkLTC bonus into pending
  check: (ctx: { totalMiners: number; totalUpgrades: number; totalClaims: number; invested: number; referrals: number }) => boolean;
}
export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_miner", label: "First Miner", description: "Deploy any rig.", reward: 0.005, check: (c) => c.totalMiners >= 1 },
  { id: "ten_miners", label: "10 Miners", description: "Own 10 rigs total.", reward: 0.05, check: (c) => c.totalMiners >= 10 },
  { id: "first_upgrade", label: "First Upgrade", description: "Level up any rig.", reward: 0.01, check: (c) => c.totalUpgrades >= 1 },
  { id: "first_claim", label: "First Claim", description: "Claim rewards once.", reward: 0.01, check: (c) => c.totalClaims >= 1 },
  { id: "invest_100", label: "Whale-in-training", description: "Invest 100 zkLTC.", reward: 0.25, check: (c) => c.invested >= 100 },
  { id: "invest_1000", label: "Institutional", description: "Invest 1000 zkLTC.", reward: 1, check: (c) => c.invested >= 1000 },
  { id: "ref_1", label: "Recruiter", description: "Invite your first friend.", reward: 0.02, check: (c) => c.referrals >= 1 },
  { id: "ref_5", label: "Ambassador", description: "Invite 5 friends.", reward: 0.15, check: (c) => c.referrals >= 5 },
];
