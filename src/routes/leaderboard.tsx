import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { useLeaderboard } from "@/lib/mining-state";
import { MINERS } from "@/lib/miners";
import { fmtZk, shortAddr } from "@/lib/format";
import { Trophy } from "lucide-react";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — LiteMiner" },
      { name: "description", content: "Top zkLTC miners on the LitVM LiteForge testnet." },
    ],
  }),
  component: Leaderboard,
});

type SortKey = "power" | "claimed" | "invested";

function Leaderboard() {
  const rows = useLeaderboard();
  const { address } = useAccount();
  const [sort, setSort] = useState<SortKey>("power");

  const enriched = useMemo(() => {
    return rows
      .map((r) => {
        const minerCount = r.minerCounts.reduce((a, b) => a + b, 0);
        const power = r.minerCounts.reduce(
          (a, c, i) => a + c * MINERS[i].ratePerDay,
          0,
        ); // zkLTC / day
        return {
          address: r.address,
          minerCount,
          power,
          claimed: r.lifetimeRewards,
          invested: r.totalInvested,
        };
      })
      .sort((a, b) => (b[sort] as number) - (a[sort] as number));
  }, [rows, sort]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 neon-orange" />
          <h1 className="font-display text-2xl font-bold">Leaderboard</h1>
        </div>
        <div className="flex gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
          {(["power", "claimed", "invested"] as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`rounded-lg px-3 py-1 text-xs capitalize transition ${
                sort === k
                  ? "bg-gradient-to-r from-sky-400 to-orange-500 text-slate-900"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {k}
            </button>
          ))}
        </div>
      </div>

      <div className="glass overflow-hidden rounded-2xl">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">Wallet</th>
              <th className="px-4 py-3 text-right">Miners</th>
              <th className="px-4 py-3 text-right">Power / day</th>
              <th className="px-4 py-3 text-right">Claimed</th>
              <th className="px-4 py-3 text-right">Invested</th>
            </tr>
          </thead>
          <tbody>
            {enriched.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                  No miners yet. Be the first to deploy a rig.
                </td>
              </tr>
            )}
            {enriched.map((r, i) => {
              const me = address?.toLowerCase() === r.address.toLowerCase();
              return (
                <tr
                  key={r.address}
                  className={`border-t border-white/5 ${me ? "bg-sky-500/10" : ""}`}
                >
                  <td className="px-4 py-3">
                    <span
                      className={`inline-grid h-7 w-7 place-items-center rounded-full font-mono text-xs font-semibold ${
                        i === 0
                          ? "bg-gradient-to-br from-amber-300 to-orange-500 text-slate-900"
                          : i === 1
                            ? "bg-gradient-to-br from-slate-200 to-slate-400 text-slate-900"
                            : i === 2
                              ? "bg-gradient-to-br from-orange-700 to-orange-900 text-white"
                              : "bg-white/10"
                      }`}
                    >
                      {i + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {shortAddr(r.address)} {me && <span className="ml-1 text-sky-400">· you</span>}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{r.minerCount}</td>
                  <td className="px-4 py-3 text-right font-mono neon-blue">{fmtZk(r.power, 4)}</td>
                  <td className="px-4 py-3 text-right font-mono neon-orange">
                    {fmtZk(r.claimed, 4)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{fmtZk(r.invested, 2)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
