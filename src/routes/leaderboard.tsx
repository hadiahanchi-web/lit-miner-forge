import { useDocMeta } from "@/lib/head";
import { useMemo, useState } from "react";
import { useAccount } from "wagmi";
import { Trophy, Loader2 } from "lucide-react";

import { useBlockRefetch, useLeaderboard, CONTRACT_DEPLOYED } from "@/lib/onchain";
import { fmtBig } from "@/lib/bigformat";
import { shortAddr } from "@/lib/format";

type SortKey = "lifetimeRewards" | "totalInvested" | "ratePerSecond" | "minerCount" | "lfrBalance";
const SORT_LABEL: Record<SortKey, string> = {
  lifetimeRewards: "Lifetime LFR",
  lfrBalance: "LFR balance",
  totalInvested: "Total invested",
  ratePerSecond: "Mining power",
  minerCount: "Miner count",
};

export default function Leaderboard() {
  useDocMeta(
    "Leaderboard — LiteMiner",
    "Top zkLTC miners on the LitVM LiteForge testnet — ranked live from the MiningManager contract.",
  );
  useBlockRefetch();
  const { address } = useAccount();
  const { rows, isLoading, playersCount } = useLeaderboard();
  const [sort, setSort] = useState<SortKey>("lifetimeRewards");

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      return bv > av ? 1 : bv < av ? -1 : 0;
    });
  }, [rows, sort]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 neon-orange" />
          <h1 className="font-display text-2xl font-bold">Leaderboard</h1>
          <span className="ml-2 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest neon-blue">
            {playersCount} on-chain players
          </span>
        </div>
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/10 bg-black/30 p-1">
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`rounded-lg px-3 py-1 text-xs transition ${
                sort === k
                  ? "bg-gradient-to-r from-sky-400 to-orange-500 text-slate-900"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {SORT_LABEL[k]}
            </button>
          ))}
        </div>
      </div>

      {!CONTRACT_DEPLOYED && (
        <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">
          Contract not deployed. Update <code>src/lib/contract.ts</code>.
        </div>
      )}

      <div className="glass overflow-hidden rounded-2xl">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-[10px] uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">Wallet</th>
              <th className="px-4 py-3 text-right">Miners</th>
              <th className="px-4 py-3 text-right">Rate/sec</th>
              <th className="px-4 py-3 text-right">Rate/day</th>
              <th className="px-4 py-3 text-right">Invested</th>
              <th className="px-4 py-3 text-right">Lifetime LFR</th>
              <th className="px-4 py-3 text-right">LFR balance</th>
              <th className="px-4 py-3 text-right">Risk</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-sky-400" />
                </td>
              </tr>
            )}
            {!isLoading && sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                  No miners on-chain yet. Be the first to deploy a rig.
                </td>
              </tr>
            )}
            {sorted.map((r, i) => {
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
                  <td className="px-4 py-3 text-right font-mono">{r.minerCount.toString()}</td>
                  <td className="px-4 py-3 text-right font-mono neon-blue">
                    {fmtBig(r.ratePerSecond, 8)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono neon-blue">
                    {fmtBig(r.ratePerSecond * 86400n, 5)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {fmtBig(r.totalInvested, 3)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono neon-orange">
                    {fmtBig(r.lifetimeRewards, 4)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono neon-orange">
                    {fmtBig(r.lfrBalance, 4)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    <span
                      className={
                        r.risk >= 100n
                          ? "text-red-300"
                          : r.risk > 0n
                            ? "text-yellow-300"
                            : "text-muted-foreground"
                      }
                    >
                      {r.risk.toString()}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}
