import { Award, CheckCircle2, Circle } from "lucide-react";
import { ACHIEVEMENTS } from "@/lib/miners";
import type { PlayerState } from "@/lib/mining-state";
import { fmtZk } from "@/lib/format";

export function AchievementsPanel({ player }: { player: PlayerState | null }) {
  const claimed = new Set(player?.achievements ?? []);
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <Award className="h-4 w-4 neon-orange" />
        <div className="font-display text-sm font-semibold">Achievements</div>
        <div className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">
          {claimed.size}/{ACHIEVEMENTS.length}
        </div>
      </div>
      <ul className="grid grid-cols-2 gap-1.5">
        {ACHIEVEMENTS.map((a) => {
          const done = claimed.has(a.id);
          return (
            <li
              key={a.id}
              className={`flex items-center gap-2 rounded-lg border px-2 py-1.5 text-xs transition ${
                done ? "border-sky-500/30 bg-sky-500/10" : "border-white/5 bg-black/20"
              }`}
            >
              {done ? (
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-sky-400" />
              ) : (
                <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] font-semibold">{a.label}</div>
                <div className="truncate text-[10px] text-muted-foreground">{a.description}</div>
              </div>
              <div className="font-mono text-[10px] neon-orange">+{fmtZk(a.reward, 3)}</div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
