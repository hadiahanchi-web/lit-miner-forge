import { CheckCircle2, Circle, Target } from "lucide-react";
import type { PlayerState } from "@/lib/mining-state";
import { MISSION_LIST } from "@/lib/mining-state";
import { fmtZk } from "@/lib/format";

export function MissionsPanel({ player }: { player: PlayerState | null }) {
  const done = new Set(player?.missionsDone ?? []);
  const completed = done.size;
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <Target className="h-4 w-4 neon-orange" />
        <div className="font-display text-sm font-semibold">Daily Missions</div>
        <div className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">
          {completed}/{MISSION_LIST.length}
        </div>
      </div>
      <ul className="space-y-1.5">
        {MISSION_LIST.map((m) => {
          const isDone = done.has(m.id);
          return (
            <li
              key={m.id}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition ${
                isDone
                  ? "border-sky-500/30 bg-sky-500/10"
                  : "border-white/5 bg-black/20"
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-sky-400" />
              ) : (
                <Circle className="h-3.5 w-3.5 text-muted-foreground" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold">{m.label}</div>
                <div className="truncate text-[10px] text-muted-foreground">{m.description}</div>
              </div>
              <div className="font-mono text-[10px] neon-orange">
                +{fmtZk(m.reward, 4)}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Rewards are paid from treasury and stack into your pending balance.
      </div>
    </div>
  );
}
