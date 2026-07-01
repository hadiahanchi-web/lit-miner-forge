import { createFileRoute } from "@tanstack/react-router";
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Coins,
  Gauge,
  Loader2,
  Wallet2,
  Zap,
  TrendingUp,
  ShieldAlert,
} from "lucide-react";

import { MINING_MANAGER_ABI, MINING_MANAGER_ADDRESS } from "@/lib/contract";
import {
  CONTRACT_DEPLOYED,
  useBlockRefetch,
  useIsAdmin,
  useMiners,
  usePendingRewards,
  usePlayer,
  usePoolInfo,
} from "@/lib/onchain";
import { fmtBig, bigMin } from "@/lib/bigformat";
import { shortAddr } from "@/lib/format";
import { MINERS } from "@/lib/miners";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — LiteMiner" },
      { name: "description", content: "Live on-chain mining stats and claim rewards." },
    ],
  }),
  component: DashboardPage,
});

function DashboardPage() {
  useBlockRefetch();
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({ address, query: { refetchInterval: 5000 } });
  const { player } = usePlayer();
  const { pending } = usePendingRewards();
  const { miners } = useMiners();
  const {
    rewardPool,
    treasury,
    withdrawPaused,
    withdrawThreshold,
    maxClaimPoolBps,
    maintenanceBps,
    emissionBps,
  } = usePoolInfo();

  // Contract-derived claim math (view-only mirror of claimRewards logic)
  const poolCap = (rewardPool * maxClaimPoolBps) / 10_000n;
  const gross = bigMin(bigMin(pending, rewardPool), poolCap);
  const fee = (gross * maintenanceBps) / 10_000n;
  const net = gross - fee;

  const meetsThreshold = pending >= withdrawThreshold;
  const canClaim =
    isConnected && !withdrawPaused && meetsThreshold && gross > 0n && CONTRACT_DEPLOYED;

  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) toast.success("Rewards claimed");
  }, [isSuccess]);

  async function onClaim() {
    try {
      const hash = await writeContractAsync({
        address: MINING_MANAGER_ADDRESS,
        abi: MINING_MANAGER_ABI,
        functionName: "claimRewards",
      });
      setTxHash(hash);
      toast.info("Claim submitted…");
    } catch (e) {
      toast.error((e as Error).message?.slice(0, 140) ?? "Transaction failed");
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold">
          <Gauge className="mr-2 inline h-7 w-7 text-sky-400" />
          Dashboard
        </h1>
        <p className="text-sm text-muted-foreground">
          {address ? shortAddr(address) : "Connect wallet"} · live from chain
        </p>
      </header>

      {!CONTRACT_DEPLOYED && (
        <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">
          Set the MiningManager address in <code>src/lib/contract.ts</code> to enable on-chain reads.
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={<Wallet2 className="h-4 w-4" />} label="Wallet balance"
          value={`${fmtBig(bal?.value ?? 0n, 4)} zkLTC`} />
        <StatCard icon={<Coins className="h-4 w-4 text-orange-400" />} label="Pending rewards"
          value={`${fmtBig(pending, 6)} zkLTC`} accent="orange" />
        <StatCard icon={<Zap className="h-4 w-4 text-yellow-300" />} label="Rate / sec"
          value={fmtBig(((player?.ratePerSecond ?? 0n) * emissionBps) / 10000n, 8)} />
        <StatCard icon={<TrendingUp className="h-4 w-4 text-emerald-400" />} label="Lifetime rewards"
          value={`${fmtBig(player?.lifetimeRewards ?? 0n, 4)} zkLTC`} />
      </section>

      <section className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="glass rounded-2xl p-5 lg:col-span-2">
          <h2 className="font-display text-lg font-semibold">Claim Rewards</h2>
          <p className="text-xs text-muted-foreground">
            Threshold, pool cap and maintenance fee are enforced by the contract.
          </p>

          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <Row label="Pending (on-chain)" value={`${fmtBig(pending, 6)} zkLTC`} />
            <Row label="Withdraw threshold" value={`${fmtBig(withdrawThreshold, 6)} zkLTC`} />
            <Row label="Pool cap / tx" value={`${fmtBig(poolCap, 6)} zkLTC`} />
            <Row label="Maintenance fee" value={`${Number(maintenanceBps) / 100}%`} />
            <Row label="Estimated gross" value={`${fmtBig(gross, 6)} zkLTC`} />
            <Row label="Estimated net" value={`${fmtBig(net, 6)} zkLTC`} highlight />
          </div>

          {!meetsThreshold && pending > 0n && (
            <div className="mt-3 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
              <ShieldAlert className="mr-1 inline h-3.5 w-3.5" />
              Below withdraw threshold. Mine more or wait until pending ≥{" "}
              {fmtBig(withdrawThreshold, 6)} zkLTC.
            </div>
          )}
          {withdrawPaused && (
            <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
              Withdrawals are paused by the owner.
            </div>
          )}

          <button
            disabled={!canClaim || isPending || isConfirming}
            onClick={onClaim}
            className="btn-neon-orange mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm sm:w-auto disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending || isConfirming ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Confirming…
              </>
            ) : (
              `Claim ${fmtBig(net, 5)} zkLTC`
            )}
          </button>
        </div>

        <div className="glass rounded-2xl p-5">
          <h2 className="font-display text-lg font-semibold">Pool Health</h2>
          <div className="mt-3 grid gap-2 text-sm">
            <Row label="Reward pool" value={`${fmtBig(rewardPool, 3)} zkLTC`} />
            <Row label="Treasury" value={`${fmtBig(treasury, 3)} zkLTC`} />
            <Row label="Emission" value={`${(Number(emissionBps) / 100).toFixed(2)}%`} />
            <Row label="Total invested" value={`${fmtBig(player?.totalInvested ?? 0n, 4)} zkLTC`} />
          </div>
        </div>
      </section>

      <section className="glass mt-4 rounded-2xl p-5">
        <h2 className="font-display text-lg font-semibold">Your miners</h2>
        {!player?.registered ? (
          <p className="mt-2 text-sm text-muted-foreground">
            You haven't bought a miner yet. Head to the Shop.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {miners.map((m) => {
              const owned = player.minerCounts?.[m.id] ?? 0n;
              const lvl = player.minerLevels?.[m.id] ?? 0n;
              if (owned === 0n) return null;
              const meta = MINERS[m.id];
              const rate = (m.ratePerSecond * owned * emissionBps) / 10000n;
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/20 p-3">
                  {meta?.image && (
                    <img
                      src={meta.image}
                      alt={meta?.name ?? `Miner #${m.id}`}
                      loading="lazy"
                      width={56}
                      height={56}
                      className="h-14 w-14 rounded-lg border border-white/10 bg-black/30 object-contain p-1"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-sm font-semibold">
                      {meta?.name ?? `Miner #${m.id}`}
                    </div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] font-mono text-muted-foreground">
                      <span>Owned: <span className="text-foreground">{owned.toString()}</span></span>
                      <span>Lv: <span className="text-foreground">{lvl.toString()}</span></span>
                      <span>Rate/s: <span className="neon-blue">{fmtBig(rate, 8)}</span></span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function StatCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: "orange";
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className={`mt-1 font-mono text-lg ${accent === "orange" ? "neon-orange" : ""}`}>
        {value}
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 px-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`font-mono text-xs ${highlight ? "neon-blue" : ""}`}>{value}</span>
    </div>
  );
}
