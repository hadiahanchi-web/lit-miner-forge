import { Copy, Users } from "lucide-react";
import { toast } from "sonner";
import type { PlayerState } from "@/lib/mining-state";
import { REFERRAL_BPS } from "@/lib/miners";
import { fmtZk, shortAddr } from "@/lib/format";

export function ReferralPanel({
  address,
  player,
}: {
  address?: string;
  player: PlayerState | null;
}) {
  const link =
    typeof window !== "undefined" && address
      ? `${window.location.origin}/?ref=${address}`
      : "";
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-2 flex items-center gap-2">
        <Users className="h-4 w-4 neon-blue" />
        <div className="font-display text-sm font-semibold">Referrals</div>
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
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Invited</div>
          <div className="font-mono font-semibold">{player?.referrals.length ?? 0}</div>
        </div>
        <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-1.5">
          <div className="text-[9px] uppercase tracking-widest text-muted-foreground">Earned</div>
          <div className="font-mono neon-orange font-semibold">
            {fmtZk(player?.referralEarnings ?? 0, 4)}
          </div>
        </div>
      </div>
      {player?.referrer && (
        <div className="mt-2 text-[10px] text-muted-foreground">
          Referred by <span className="font-mono neon-blue">{shortAddr(player.referrer)}</span>
        </div>
      )}
    </div>
  );
}
