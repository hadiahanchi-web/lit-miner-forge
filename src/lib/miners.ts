import type { LucideIcon } from "lucide-react";
import { Usb, Cpu, HardDrive, Microchip, Atom, Flame } from "lucide-react";
import usbImg from "@/assets/miners/usb.png";
import starterImg from "@/assets/miners/starter.png";
import gpuImg from "@/assets/miners/gpu.png";
import asicImg from "@/assets/miners/asic.png";
import quantumImg from "@/assets/miners/quantum.png";
import fusionImg from "@/assets/miners/fusion.png";

export interface MinerType {
  id: number;
  name: string;
  price: number; // zkLTC
  ratePerDay: number; // zkLTC / day at level 1, 100% efficiency, 100% durability
  color: string;
  accent: string;
  description: string;
  tier: "usb" | "starter" | "gpu" | "asic" | "quantum" | "fusion";
  icon: LucideIcon;
  symbol: string;
  /** Player-level unlock: previous tier must be owned OR minInvested reached. */
  unlock: { requiresMinerId?: number; minInvested?: number; label: string };
  /** Static hardware efficiency stat 0.5 .. 2.0 (already reflected in ratePerDay/price). */
  efficiency: number;
  /** Hours of continuous mining before durability hits 0 (needs repair). */
  durabilityLifespanHours: number;
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
    efficiency: 0.6,
    durabilityLifespanHours: 168, // 7 days
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
    efficiency: 0.9,
    durabilityLifespanHours: 120,
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
    efficiency: 1.1,
    durabilityLifespanHours: 96,
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
    efficiency: 1.4,
    durabilityLifespanHours: 72,
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
    efficiency: 1.7,
    durabilityLifespanHours: 60,
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
    efficiency: 2.0,
    durabilityLifespanHours: 48,
  },
];

// ============================================================================
//  v4 — Sustainable economy
// ============================================================================

// Withdrawals
export const WITHDRAW_THRESHOLD = 0.005; // zkLTC (very low for testnet)
export const CLAIMS_PER_EPOCH = 1;       // 1 claim per 24h epoch

// Fee split — all inflows split 70% pool / 30% treasury (was 80/20)
export const REWARD_POOL_BPS = 7000;
export const TREASURY_BPS = 3000;
export const MAINTENANCE_FEE_BPS = 500;  // 5% of claim → treasury (energy cost)

// Daily reward budget
export const EPOCH_SEC = 86_400;
/** % of the reward pool that can be emitted globally per epoch (5%). */
export const DAILY_EMISSION_BPS = 300;
/** % of the daily emission any single wallet can earn per epoch (1%). */
export const PER_WALLET_EPOCH_CAP_BPS = 100;

// Wallet energy (0..100, regenerates when idle, drains while mining)
export const WALLET_ENERGY_MAX = 100;
export const WALLET_ENERGY_REGEN_PER_SEC = 100 / (6 * 3600);   // full regen in 6h
export const WALLET_ENERGY_DRAIN_PER_SEC = 100 / (12 * 3600);  // full drain in 12h mining
/** Refill 1 energy unit costs this many zkLTC (paid to sinks). */
export const ENERGY_REFILL_COST_PER_UNIT = 0.0002;

// Miner durability (per-tier avg 0..100). Drains proportional to fleet size.
export const DURABILITY_MAX = 100;
/** Repair 1 unit of durability per owned rig costs this fraction of miner price. */
export const REPAIR_COST_BPS = 20; // 0.2% of price per unit per rig → full repair = 20% of one rig price

// Anti-farm
export const ACTION_COOLDOWN_SEC = 3;

// Upgrades — balanced exponential
export const MAX_LEVEL = 10;
/** Cost from L→L+1: 0.2 * price * 1.5^(level-1). */
export function upgradeCost(minerId: number, currentLevel: number): number {
  if (currentLevel <= 0 || currentLevel >= MAX_LEVEL) return Infinity;
  const base = MINERS[minerId].price;
  return +(base * 0.2 * Math.pow(1.5, currentLevel - 1)).toFixed(6);
}
/** Rate multiplier at level: +25% per level (1x at L1 → 3.25x at L10). */
export function levelMultiplier(level: number): number {
  return 1 + (Math.max(1, level) - 1) * 0.25;
}

// Pool-health emission throttle (independent of daily budget — extra safety valve).
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

/** Duration for full-durability drain in seconds, for a given tier. */
export function durabilityDrainPerSec(minerId: number): number {
  return DURABILITY_MAX / (MINERS[minerId].durabilityLifespanHours * 3600);
}

/** Static per-tier efficiency stat surfaced to the UI. */
export function tierEfficiency(minerId: number): number {
  return MINERS[minerId].efficiency;
}

// Referrals
export const REFERRAL_BPS = 500; // 5% of purchase → referrer

// Daily engagement
export const MISSION_REWARD = 0.01;
export const DAILY_LOGIN_REWARD = 0.003;
export const CHEST_MIN = 0.002;
export const CHEST_MAX = 0.02;
export const SPIN_SLOTS: { label: string; amount: number; weight: number }[] = [
  { label: "0.0005", amount: 0.0005, weight: 30 },
  { label: "0.002", amount: 0.002, weight: 25 },
  { label: "0.005", amount: 0.005, weight: 20 },
  { label: "0.01", amount: 0.01, weight: 15 },
  { label: "0.025", amount: 0.025, weight: 7 },
  { label: "0.05 ★", amount: 0.05, weight: 3 },
];

// Player level: sqrt(invested * 10), capped at 100.
export function playerLevel(invested: number): number {
  return Math.min(100, Math.floor(Math.sqrt(Math.max(0, invested) * 10)));
}

// Achievements
export interface Achievement {
  id: string;
  label: string;
  description: string;
  reward: number;
  check: (ctx: { totalMiners: number; totalUpgrades: number; totalClaims: number; invested: number; referrals: number }) => boolean;
}
export const ACHIEVEMENTS: Achievement[] = [
  { id: "first_miner", label: "First Miner", description: "Deploy any rig.", reward: 0.003, check: (c) => c.totalMiners >= 1 },
  { id: "ten_miners", label: "10 Miners", description: "Own 10 rigs total.", reward: 0.03, check: (c) => c.totalMiners >= 10 },
  { id: "first_upgrade", label: "First Upgrade", description: "Level up any rig.", reward: 0.005, check: (c) => c.totalUpgrades >= 1 },
  { id: "first_claim", label: "First Claim", description: "Claim rewards once.", reward: 0.005, check: (c) => c.totalClaims >= 1 },
  { id: "invest_100", label: "Whale-in-training", description: "Invest 100 zkLTC.", reward: 0.15, check: (c) => c.invested >= 100 },
  { id: "invest_1000", label: "Institutional", description: "Invest 1000 zkLTC.", reward: 0.75, check: (c) => c.invested >= 1000 },
  { id: "ref_1", label: "Recruiter", description: "Invite your first friend.", reward: 0.015, check: (c) => c.referrals >= 1 },
  { id: "ref_5", label: "Ambassador", description: "Invite 5 friends.", reward: 0.1, check: (c) => c.referrals >= 5 },
];
