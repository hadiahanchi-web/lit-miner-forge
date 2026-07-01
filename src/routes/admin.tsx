import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { adminFundPool, adminReadPool, adminUpdate, type PoolState } from "@/lib/mining-state";
import { fmtZk } from "@/lib/format";
import { toast } from "sonner";
import { Pause, Play, Plus, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — LiteMiner" },
      { name: "description", content: "Owner controls for the LiteMiner mining protocol." },
    ],
  }),
  component: Admin,
});

function Admin() {
  const { address } = useAccount();
  const [pool, setPool] = useState<PoolState>(() => adminReadPool());
  const [rewardBps, setRewardBps] = useState(pool.rewardBps);
  const [fund, setFund] = useState("");

  useEffect(() => {
    const t = setInterval(() => setPool(adminReadPool()), 2000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setRewardBps(pool.rewardBps);
  }, [pool.rewardBps]);

  if (!address) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Connect a wallet to view admin controls.</p>
      </main>
    );
  }

  const treasuryBps = 10_000 - rewardBps;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 neon-blue" />
        <h1 className="font-display text-2xl font-bold">Protocol Admin</h1>
        <span className="ml-2 rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest neon-orange">
          Owner-only on-chain
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="glass rounded-2xl p-5">
          <h2 className="font-display text-sm font-semibold">Reward split</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Adjust the share of every purchase that funds the Reward Pool vs Treasury.
          </p>
          <div className="mt-4">
            <input
              type="range"
              min={0}
              max={10000}
              step={100}
              value={rewardBps}
              onChange={(e) => setRewardBps(Number(e.target.value))}
              className="w-full accent-sky-400"
            />
            <div className="mt-2 flex justify-between text-xs">
              <span className="neon-blue font-mono">Pool {(rewardBps / 100).toFixed(0)}%</span>
              <span className="neon-orange font-mono">
                Treasury {(treasuryBps / 100).toFixed(0)}%
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              adminUpdate({ rewardBps, treasuryBps });
              toast.success("Split updated");
            }}
            className="btn-neon mt-4 w-full rounded-xl px-3 py-2 text-sm"
          >
            Save split
          </button>
        </div>

        <div className="glass rounded-2xl p-5">
          <h2 className="font-display text-sm font-semibold">Circuit breakers</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Emergency toggles for mining purchases and withdrawals.
          </p>
          <div className="mt-4 space-y-2">
            <Toggle
              label="Mining"
              paused={pool.paused}
              onClick={() => {
                adminUpdate({ paused: !pool.paused });
                toast.success(`Mining ${!pool.paused ? "paused" : "resumed"}`);
              }}
            />
            <Toggle
              label="Withdrawals"
              paused={pool.withdrawPaused}
              onClick={() => {
                adminUpdate({ withdrawPaused: !pool.withdrawPaused });
                toast.success(`Withdrawals ${!pool.withdrawPaused ? "paused" : "resumed"}`);
              }}
            />
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <h2 className="font-display text-sm font-semibold">Fund Reward Pool</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Top up the Reward Pool to restore emissions to 100%.
          </p>
          <div className="mt-3 flex gap-2">
            <input
              type="number"
              min="0"
              step="0.01"
              value={fund}
              onChange={(e) => setFund(e.target.value)}
              placeholder="Amount (zkLTC)"
              className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-mono outline-none placeholder:text-muted-foreground focus:border-sky-500/60"
            />
            <button
              onClick={() => {
                const n = Number(fund);
                if (!isFinite(n) || n <= 0) {
                  toast.error("Enter a positive amount");
                  return;
                }
                adminFundPool(n);
                setFund("");
                toast.success(`Funded ${n} zkLTC to Reward Pool`);
              }}
              className="btn-neon inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm"
            >
              <Plus className="h-3.5 w-3.5" /> Fund
            </button>
          </div>
        </div>

        <div className="glass rounded-2xl p-5">
          <h2 className="font-display text-sm font-semibold">Owner utilities</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Additional owner-only actions available on the on-chain contract.
          </p>
          <ul className="mt-3 space-y-1.5 text-xs text-muted-foreground">
            <li>· <span className="font-mono neon-blue">addMiner(price, rate)</span> — publish a new tier</li>
            <li>· <span className="font-mono neon-blue">updateMiner(id, ...)</span> — retune an existing tier</li>
            <li>· <span className="font-mono neon-blue">withdrawTreasury(to, amt)</span></li>
            <li>· <span className="font-mono neon-blue">fundRewardPool()</span> payable</li>
          </ul>
        </div>

        <div className="glass rounded-2xl p-5 md:col-span-2">
          <h2 className="font-display text-sm font-semibold">Protocol statistics</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Reward Pool" value={`${fmtZk(pool.rewardPool, 4)} zkLTC`} accent="blue" />
            <Stat label="Treasury" value={`${fmtZk(pool.treasury, 4)} zkLTC`} accent="orange" />
            <Stat label="Total Deposits" value={`${fmtZk(pool.totalDeposits, 4)} zkLTC`} />
            <Stat label="Distributed" value={`${fmtZk(pool.totalDistributed, 4)} zkLTC`} />
            <Stat label="Players" value={String(pool.players.length)} />
            <Stat label="Reward BPS" value={String(pool.rewardBps)} />
            <Stat label="Treasury BPS" value={String(pool.treasuryBps)} />
            <Stat
              label="Status"
              value={pool.paused ? "PAUSED" : "LIVE"}
              accent={pool.paused ? "orange" : "blue"}
            />
          </div>
        </div>
      </div>
    </main>
  );
}

function Toggle({
  label,
  paused,
  onClick,
}: {
  label: string;
  paused: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm transition ${
        paused
          ? "border-orange-500/40 bg-orange-500/10 neon-orange"
          : "border-sky-500/40 bg-sky-500/10 neon-blue"
      }`}
    >
      <span className="font-semibold">{label}</span>
      <span className="inline-flex items-center gap-2 font-mono text-xs">
        {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        {paused ? "Resume" : "Pause"}
      </span>
    </button>
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
    <div className="rounded-xl border border-white/5 bg-black/20 p-3">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-mono text-sm font-semibold ${
          accent === "blue" ? "neon-blue" : accent === "orange" ? "neon-orange" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
