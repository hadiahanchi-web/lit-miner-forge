import { Award, Copy, Users } from "lucide-react";
import { toast } from "sonner";
import type { PlayerState } from "@/lib/mining-state";
import { REFERRAL_BPS } from "@/lib/miners";
import { fmtZk, shortAddr } from "@/lib/format";

const MILESTONES = [
  { count: 1, label: "Recruiter", bonus: "+0.02 zkLTC" },
  { count: 5, label: "Ambassador", bonus: "+0.15 zkLTC" },
  { count: 10, label: "Evangelist", bonus: "10% rate boost (soon)" },
  { count: 25, label: "Legend", bonus: "Guild seat (soon)" },
];

export function ReferralPanel({
  address,
  player,
}: {
  address?: string;
  player: PlayerState | null;
}) {
  const link =
    typeof window !== "undefined" && address ? `${window.location.origin}/?ref=${address}` : "";
  const invited = player?.referrals.length ?? 0;

  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <Users className="h-4 w-4 neon-blue" />
        <div className="font-display text-sm font-semibold">Referral Dashboard</div>
        <div className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">
          {(REFERRAL_BPS / 100).toFixed(0)}% bonus
        </div>
      </div>
      <div className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/30 p-2">
        <div className="flex-1 truncate font-mono text-[11px] text-muted-foreground">
          {link || "Connect wallet"}
        </div>
        <button
          disabled={!link}
          onClick={async () => {
            await navigator.clipboard.writeText(link);
            toast.success("Referral link copied");
          }}
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[10px] font-semibold text-foreground transition hover:bg-white/10 disabled:opacity-40"
        >
          <Copy className="h-3 w-3" /> Copy
        </button>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
        <Stat label="Invited" value={String(invited)} />
        <Stat
          label="Earned"
          value={fmtZk(player?.referralEarnings ?? 0, 4)}
          accent="orange"
        />
        <Stat
          label="Referrer"
          value={player?.referrer ? shortAddr(player.referrer) : "—"}
          accent="blue"
        />
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Award className="h-3 w-3" /> Milestones
        </div>
        <ul className="space-y-1">
          {MILESTONES.map((m) => {
            const done = invited >= m.count;
            return (
              <li
                key={m.count}
                className={`flex items-center gap-2 rounded-lg border px-2 py-1 text-[11px] ${
                  done ? "border-sky-500/30 bg-sky-500/10" : "border-white/5 bg-black/20"
                }`}
              >
                <span className={`font-mono ${done ? "neon-blue" : "text-muted-foreground"}`}>
                  {m.count}
                </span>
                <span className={done ? "" : "text-muted-foreground"}>{m.label}</span>
                <span className="ml-auto text-[10px] text-muted-foreground">{m.bonus}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "blue" | "orange";
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={`font-mono text-xs font-semibold ${
          accent === "orange" ? "neon-orange" : accent === "blue" ? "neon-blue" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
