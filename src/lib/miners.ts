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
  symbol: string; // short label for the pixi rig
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
  },
];

export const WITHDRAW_THRESHOLD = 10; // zkLTC
export const REWARD_POOL_BPS = 8000; // 80%
export const TREASURY_BPS = 2000; // 20%

// Upgrades
export const MAX_LEVEL = 10;
/** Cost to go from `level` -> `level + 1` for miner `id` (zkLTC). */
export function upgradeCost(minerId: number, currentLevel: number): number {
  if (currentLevel >= MAX_LEVEL) return Infinity;
  const base = MINERS[minerId].price;
  // 50% of price, scaled up per level so late upgrades bite
  return +(base * 0.5 * currentLevel).toFixed(6);
}
/** Rate multiplier at a given level (1 = base). +25% per level → 3.25x at L10 */
export function levelMultiplier(level: number): number {
  return 1 + (Math.max(1, level) - 1) * 0.25;
}

// Referrals
export const REFERRAL_BPS = 500; // 5% of purchase paid to referrer from treasury

// Daily missions
export const MISSION_REWARD = 0.02; // zkLTC per completed mission
export const DAILY_LOGIN_REWARD = 0.005;
