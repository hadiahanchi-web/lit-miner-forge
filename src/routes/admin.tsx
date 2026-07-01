import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { adminFundPool, adminReadPool, adminUpdate, type PoolState } from "@/lib/mining-state";
import { fmtZk } from "@/lib/format";
import { toast } from "sonner";
import { Pause, Play, Plus, ShieldCheck, ShieldAlert } from "lucide-react";
import { MINING_MANAGER_ABI, MINING_MANAGER_ADDRESS } from "@/lib/contract";
import { CONTRACT_DEPLOYED } from "@/lib/onchain";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — LiteMiner" },
      { name: "description", content: "Owner controls for the LiteMiner mining protocol." },
    ],
  }),
  component: Admin,
});

const contract = { address: MINING_MANAGER_ADDRESS, abi: MINING_MANAGER_ABI } as const;

function useIsAuthorizedAdmin(address?: `0x${string}`) {
  const { data, isLoading } = useReadContracts({
    contracts: address
      ? [
          { ...contract, functionName: "owner" },
          { ...contract, functionName: "admins", args: [address] },
        ]
      : [],
    query: { enabled: !!address && CONTRACT_DEPLOYED },
  });
  const owner = (data?.[0]?.result as `0x${string}` | undefined) ?? undefined;
  const isAdminMap = (data?.[1]?.result as boolean | undefined) ?? false;
  const isOwner =
    !!address && !!owner && address.toLowerCase() === owner.toLowerCase();
  return { isAuthorized: isOwner || isAdminMap, owner, isLoading };
}

function Unauthorized({ address, owner }: { address?: string; owner?: string }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <div className="glass rounded-2xl border border-red-500/30 p-8 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-red-400" />
        <h1 className="mt-3 font-display text-xl font-semibold">Access denied</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The admin panel is restricted to the on-chain contract owner and approved admin wallets.
        </p>
        <div className="mt-4 space-y-1 font-mono text-[11px] text-muted-foreground">
          {address && <div>You: {address}</div>}
          {owner && <div>Owner: {owner}</div>}
        </div>
      </div>
    </main>
  );
}

function Admin() {
  const { address } = useAccount();
  const { isAuthorized, owner, isLoading: authLoading } = useIsAuthorizedAdmin(address);
  const [pool, setPool] = useState<PoolState>(() => adminReadPool());
  const [rewardBps, setRewardBps] = useState(pool.rewardBps);
  const [emissionBps, setEmissionBps] = useState(pool.dailyEmissionBps);
  const [capBps, setCapBps] = useState(pool.perWalletEpochCapBps);
  const [fund, setFund] = useState("");

  useEffect(() => {
    if (!isAuthorized) return;
    const t = setInterval(() => setPool(adminReadPool()), 2000);
    return () => clearInterval(t);
  }, [isAuthorized]);

  useEffect(() => {
    setRewardBps(pool.rewardBps);
    setEmissionBps(pool.dailyEmissionBps);
    setCapBps(pool.perWalletEpochCapBps);
  }, [pool.rewardBps, pool.dailyEmissionBps, pool.perWalletEpochCapBps]);


  if (!address) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Connect a wallet to view admin controls.</p>
      </main>
    );
  }

  if (!CONTRACT_DEPLOYED) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">
          Contract not deployed. Admin panel unavailable.
        </p>
      </main>
    );
  }

  if (authLoading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Verifying admin permissions…</p>
      </main>
    );
  }

  if (!isAuthorized) {
    return <Unauthorized address={address} owner={owner} />;
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
          <h2 className="font-display text-sm font-semibold">Emission controls</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Daily reward budget (% of pool) and per-wallet share (% of budget).
          </p>
          <div className="mt-4 space-y-3">
            <div>
              <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>Daily emission</span>
                <span className="font-mono neon-blue">{(emissionBps / 100).toFixed(2)}%</span>
              </div>
              <input
                type="range" min={50} max={5000} step={50}
                value={emissionBps}
                onChange={(e) => setEmissionBps(Number(e.target.value))}
                className="w-full accent-sky-400"
              />
            </div>
            <div>
              <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
                <span>Per-wallet cap</span>
                <span className="font-mono neon-orange">{(capBps / 100).toFixed(2)}%</span>
              </div>
              <input
                type="range" min={10} max={2500} step={10}
                value={capBps}
                onChange={(e) => setCapBps(Number(e.target.value))}
                className="w-full accent-orange-500"
              />
            </div>
          </div>
          <button
            onClick={() => {
              adminUpdate({ dailyEmissionBps: emissionBps, perWalletEpochCapBps: capBps });
              toast.success("Emissions updated");
            }}
            className="btn-neon mt-3 w-full rounded-xl px-3 py-2 text-sm"
          >
            Save emission
          </button>
        </div>

        <div className="glass rounded-2xl p-5 md:col-span-2">
          <h2 className="font-display text-sm font-semibold">Protocol statistics</h2>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat label="Reward Pool" value={`${fmtZk(pool.rewardPool, 4)} zkLTC`} accent="blue" />
            <Stat label="Treasury" value={`${fmtZk(pool.treasury, 4)} zkLTC`} accent="orange" />
            <Stat label="Total Deposits" value={`${fmtZk(pool.totalDeposits, 4)} zkLTC`} />
            <Stat label="Distributed" value={`${fmtZk(pool.totalDistributed, 4)} zkLTC`} />
            <Stat label="Epoch Budget" value={fmtZk(pool.epochBudget, 4)} accent="blue" />
            <Stat label="Budget Left" value={fmtZk(pool.epochRemaining, 4)} accent="orange" />
            <Stat label="Reward BPS" value={String(pool.rewardBps)} />
            <Stat label="Players" value={String(pool.players.length)} />
            <Stat label="Emission BPS" value={String(pool.dailyEmissionBps)} />
            <Stat label="Wallet Cap BPS" value={String(pool.perWalletEpochCapBps)} />
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
