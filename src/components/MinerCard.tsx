import { MINERS, WITHDRAW_THRESHOLD } from "@/lib/miners";
import { fmtZk } from "@/lib/format";
import { Zap, Lock } from "lucide-react";
import { toast } from "sonner";

interface Props {
  miner: (typeof MINERS)[number];
  owned: number;
  balance: number;
  onBuy: (id: number) => void;
  disabled?: boolean;
}

export function MinerCard({ miner, owned, balance, onBuy, disabled }: Props) {
  const canAfford = balance >= miner.price;
  const locked = miner.id > 0 && owned === 0 && !canAfford;
  return (
    <div
      className="glass group relative flex flex-col overflow-hidden rounded-2xl p-4 transition"
      style={{
        boxShadow: owned > 0 ? `0 0 24px -8px ${miner.color}66` : undefined,
      }}
    >
      <div
        className="absolute inset-x-0 top-0 h-0.5 opacity-70"
        style={{ background: `linear-gradient(90deg, transparent, ${miner.color}, transparent)` }}
      />
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Tier {miner.id + 1} · {miner.tier}
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
          <Zap className="h-5 w-5" style={{ color: miner.color }} />
        </div>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">{miner.description}</p>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <Metric label="Price" value={`${miner.price} zkLTC`} />
        <Metric label="Rate/day" value={fmtZk(miner.ratePerDay, 4)} />
        <Metric label="Owned" value={String(owned)} highlight={owned > 0} />
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
          miner.id === 0 ? "btn-neon" : "btn-neon-orange"
        }`}
      >
        {locked && <Lock className="h-3.5 w-3.5" />}
        {canAfford ? `Deploy · ${miner.price} zkLTC` : `Need ${miner.price} zkLTC`}
      </button>
      {miner.ratePerDay >= WITHDRAW_THRESHOLD / 30 && (
        <div className="mt-1 text-center text-[10px] text-muted-foreground">
          Reaches 10 zkLTC withdrawal in ≈{Math.ceil(WITHDRAW_THRESHOLD / miner.ratePerDay)} days
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
