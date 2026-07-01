import { Activity } from "lucide-react";
import { fmtZk } from "@/lib/format";

export function PoolHealth({
  health,
  emission,
  budgetRemaining,
  budgetTotal,
}: {
  health: number;
  emission: number;
  budgetRemaining?: number;
  budgetTotal?: number;
}) {
  const pct = Math.round(health * 100);
  const color =
    health >= 0.6
      ? "linear-gradient(90deg,#22c55e,#38bdf8)"
      : health >= 0.4
        ? "linear-gradient(90deg,#38bdf8,#22d3ee)"
        : health >= 0.2
          ? "linear-gradient(90deg,#f59e0b,#f97316)"
          : "linear-gradient(90deg,#ef4444,#f97316)";
  const budgetPct = budgetTotal && budgetTotal > 0 ? Math.round(((budgetRemaining ?? 0) / budgetTotal) * 100) : 100;
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <Activity className="h-4 w-4 neon-blue" />
        <div className="font-display text-sm font-semibold">Reward Pool Health</div>
        <div className="ml-auto font-mono text-xs neon-blue">{pct}%</div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white/5">
        <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>Emission rate</span>
        <span className="font-mono">
          {emission === 0 ? "OFFLINE" : `${(emission * 100).toFixed(0)}% of nominal`}
        </span>
      </div>
      {budgetTotal !== undefined && (
        <div className="mt-3 border-t border-white/5 pt-2">
          <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
            <span>Daily budget left</span>
            <span className="font-mono neon-orange">
              {fmtZk(budgetRemaining ?? 0, 4)} / {fmtZk(budgetTotal, 4)}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full transition-all"
              style={{
                width: `${budgetPct}%`,
                background: "linear-gradient(90deg,#f97316,#f59e0b)",
              }}
            />
          </div>
          <div className="mt-1 text-[10px] text-muted-foreground">
            Global epoch budget: 5% of pool. Per-wallet cap: 1% of budget. Resets every 24h.
          </div>
        </div>
      )}
    </div>
  );
}
