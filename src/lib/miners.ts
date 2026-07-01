export interface MinerType {
  id: number;
  name: string;
  price: number; // zkLTC
  ratePerDay: number; // zkLTC / day
  color: string; // primary neon
  accent: string;
  description: string;
  tier: "starter" | "gpu" | "asic" | "quantum" | "fusion";
}

export const MINERS: MinerType[] = [
  {
    id: 0,
    name: "Starter Miner",
    price: 1,
    ratePerDay: 0.01,
    color: "#38bdf8",
    accent: "#0ea5e9",
    tier: "starter",
    description: "Reliable entry-level rig. Perfect for your first shaft.",
  },
  {
    id: 1,
    name: "GPU Miner",
    price: 10,
    ratePerDay: 0.12,
    color: "#22d3ee",
    accent: "#0891b2",
    tier: "gpu",
    description: "Parallelized GPU array. Higher throughput, higher heat.",
  },
  {
    id: 2,
    name: "ASIC Miner",
    price: 50,
    ratePerDay: 0.7,
    color: "#f97316",
    accent: "#ea580c",
    tier: "asic",
    description: "Application-specific silicon tuned for zkLTC hashing.",
  },
  {
    id: 3,
    name: "Quantum Miner",
    price: 250,
    ratePerDay: 4,
    color: "#a855f7",
    accent: "#7c3aed",
    tier: "quantum",
    description: "Superposition-driven proofs. Cold, silent, devastating.",
  },
  {
    id: 4,
    name: "Fusion Miner",
    price: 1000,
    ratePerDay: 20,
    color: "#f59e0b",
    accent: "#f97316",
    tier: "fusion",
    description: "Reactor-class rig. The apex of the LiteForge fleet.",
  },
];

export const WITHDRAW_THRESHOLD = 10; // zkLTC
export const REWARD_POOL_BPS = 8000; // 80%
export const TREASURY_BPS = 2000; // 20%
