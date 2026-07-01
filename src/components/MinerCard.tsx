import { MINERS, WITHDRAW_THRESHOLD, MAX_LEVEL, upgradeCost, levelMultiplier } from "@/lib/miners";
import { fmtZk } from "@/lib/format";
import { ChevronUp, Lock } from "lucide-react";
import { toast } from "sonner";

interface Props {
  miner: (typeof MINERS)[number];
  owned: number;
  level: number;
  balance: number;
  onBuy: (id: number) => void;
  onUpgrade: (id: number) => void;
  disabled?: boolean;
}

export function MinerCard({ miner, owned, level, balance, onBuy, onUpgrade, disabled }: Props) {
  const canAfford = balance >= miner.price;
  const Icon = miner.icon;
  const mult = level > 0 ? levelMultiplier(level) : 1;
  const effectiveRate = miner.ratePerDay * owned * mult;
  const upCost = level > 0 ? upgradeCost(miner.id, level) : 0;
  const canUpgrade = level > 0 && level < MAX_LEVEL && balance >= upCost;

  return (
    <div
      className="glass group relative flex flex-col overflow-hidden rounded-2xl p-4 transition"
      style={{ boxShadow: owned > 0 ? `0 0 24px -8px ${miner.color}66` : undefined }}
    >
      <div
        className="absolute inset-x-0 top-0 h-0.5 opacity-70"
        style={{ background: `linear-gradient(90deg, transparent, ${miner.color}, transparent)` }}
      />
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Tier {miner.id} · {miner.tier}
          </div>
          <div className="font-display text-lg font-semibold">{miner.name}</div>
        </div>
        <div
          className="grid h-10 w-10 place-items-center rounded-xl"
          style={{
            background: `linear-gradient(135deg, ${miner.color}33, ${miner.accent}33)`,
            border: `1px solid ${miner.color}55`,
          }}
        >
          <Icon className="h-5 w-5" style={{ color: miner.color }} />
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{miner.description}</p>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Metric label="Price" value={`${miner.price} zkLTC`} />
        <Metric
          label="Rate/day"
          value={owned > 0 ? fmtZk(effectiveRate, 5) : fmtZk(miner.ratePerDay, 5)}
        />
        <Metric
          label={owned > 0 ? `Owned · L${level}` : "Owned"}
          value={owned > 0 ? `${owned} · ${mult.toFixed(2)}×` : "0"}
          highlight={owned > 0}
        />
      </div>

      <button
        disabled={disabled || !canAfford}
        onClick={() => {
          try {
            onBuy(miner.id);
            toast.success(`Purchased ${miner.name}`, { description: `-${miner.price} zkLTC` });
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
        className={`mt-4 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm ${
          miner.id <= 1 ? "btn-neon" : "btn-neon-orange"
        }`}
      >
        {!canAfford && <Lock className="h-3.5 w-3.5" />}
        {canAfford ? `Deploy · ${miner.price} zkLTC` : `Need ${miner.price} zkLTC`}
      </button>

      {owned > 0 && (
        <button
          disabled={disabled || !canUpgrade || level >= MAX_LEVEL}
          onClick={() => {
            try {
              onUpgrade(miner.id);
              toast.success(`Upgraded ${miner.name} → L${level + 1}`);
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
          className="mt-2 inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-white/5 px-4 py-1.5 text-xs font-semibold text-foreground transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronUp className="h-3.5 w-3.5" />
          {level >= MAX_LEVEL
            ? "Max level"
            : `Upgrade L${level} → L${level + 1} · ${fmtZk(upCost, 4)} zkLTC`}
        </button>
      )}

      {miner.ratePerDay >= WITHDRAW_THRESHOLD / 30 && (
        <div className="mt-1 text-center text-[10px] text-muted-foreground">
          Reaches {WITHDRAW_THRESHOLD} zkLTC withdrawal in ≈
          {Math.ceil(WITHDRAW_THRESHOLD / miner.ratePerDay)} days
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`font-mono ${highlight ? "neon-blue" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
