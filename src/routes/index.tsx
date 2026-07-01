import { createFileRoute } from "@tanstack/react-router";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance } from "wagmi";
import { Suspense, lazy, useEffect } from "react";
import { toast } from "sonner";

import { MinerCard } from "@/components/MinerCard";
import { MINERS, WITHDRAW_THRESHOLD } from "@/lib/miners";
import { useMiningState } from "@/lib/mining-state";
import { fmtZk } from "@/lib/format";
import { CircuitBoard, Coins, Flame, Gauge, Wallet2 } from "lucide-react";

const MiningScene = lazy(() =>
  import("@/components/MiningScene").then((m) => ({ default: m.MiningScene })),
);

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({ address });
  const balance = bal ? Number(bal.value) / 1e18 : 0;

  const { player, pool, livePending, ratePerSecond, register, buyMiner, claim } =
    useMiningState(address);

  useEffect(() => {
    if (isConnected && address && player && !player.registered) {
      register();
    }
  }, [isConnected, address, player, register]);

  if (!isConnected || !address) return <ConnectGate />;

  const totalMiners = player?.minerCounts.reduce((a, b) => a + b, 0) ?? 0;
  const dailyRate = ratePerSecond * 86_400;
  const canClaim = livePending >= WITHDRAW_THRESHOLD;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      {/* Hero + scene */}
      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="glass relative h-[420px] overflow-hidden rounded-2xl">
          <Suspense
            fallback={
              <div className="grid h-full place-items-center text-sm text-muted-foreground">
                Booting facility…
              </div>
            }
          >
            <MiningScene
              minerCounts={player?.minerCounts ?? MINERS.map(() => 0)}
              running={totalMiners > 0}
            />
          </Suspense>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <div className="glass rounded-xl px-3 py-1.5">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
                Facility
              </div>
              <div className="font-mono text-sm font-semibold neon-blue">
                {totalMiners} rigs online
              </div>
            </div>
            <div className="glass rounded-xl px-3 py-1.5 text-right">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
                Live yield
              </div>
              <div className="font-mono text-sm font-semibold neon-orange">
                {fmtZk(dailyRate, 4)} / day
              </div>
            </div>
          </div>
          {totalMiners === 0 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="glass max-w-xs rounded-2xl p-4 text-center">
                <div className="text-sm font-semibold">Empty facility</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Deploy your first Starter Miner to begin generating zkLTC.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Player panel */}
        <div className="flex flex-col gap-3">
          <PlayerPanel
            balance={balance}
            pending={livePending}
            lifetime={player?.lifetimeRewards ?? 0}
            invested={player?.totalInvested ?? 0}
            miners={totalMiners}
            dailyRate={dailyRate}
          />
          <button
            onClick={() => {
              try {
                claim();
                toast.success("Rewards claimed", {
                  description: `${fmtZk(livePending, 4)} zkLTC → wallet`,
                });
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
            disabled={!canClaim}
            className="btn-neon-orange w-full rounded-2xl px-4 py-3 text-sm"
          >
            {canClaim
              ? `Claim ${fmtZk(livePending, 4)} zkLTC`
              : `Threshold ${WITHDRAW_THRESHOLD} zkLTC — earning…`}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <PoolStat label="Reward Pool" value={fmtZk(pool.rewardPool, 2)} icon={<Coins />} />
            <PoolStat label="Treasury" value={fmtZk(pool.treasury, 2)} icon={<Flame />} />
            <PoolStat
              label="Total Deposits"
              value={fmtZk(pool.totalDeposits, 2)}
              icon={<Wallet2 />}
            />
            <PoolStat
              label="Distributed"
              value={fmtZk(pool.totalDistributed, 2)}
              icon={<Gauge />}
            />
          </div>
        </div>
      </section>

      {/* Marketplace */}
      <section className="mt-8">
        <div className="mb-3 flex items-center gap-2">
          <CircuitBoard className="h-4 w-4 text-sky-400" />
          <h2 className="font-display text-lg font-semibold">Rig Marketplace</h2>
          <div className="text-xs text-muted-foreground">
            · 80% of every purchase seeds the Reward Pool, 20% funds Treasury
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {MINERS.map((m) => (
            <MinerCard
              key={m.id}
              miner={m}
              owned={player?.minerCounts[m.id] ?? 0}
              balance={balance}
              onBuy={buyMiner}
              disabled={pool.paused}
            />
          ))}
        </div>
        {pool.paused && (
          <div className="mt-3 rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-200">
            Mining is currently paused by the protocol owner.
          </div>
        )}
      </section>
    </main>
  );
}

function ConnectGate() {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-64px)] max-w-3xl place-items-center px-4">
      <div className="glass w-full rounded-3xl p-10 text-center">
        <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-gradient-to-br from-sky-400 to-orange-500 shadow-lg shadow-sky-500/30 animate-pulse-glow" />
        <h1 className="font-display text-3xl font-bold">Enter the LiteForge</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Connect a wallet on chain <span className="font-mono neon-blue">4441</span> to spin up
          your first zkLTC mining rig.
        </p>
        <div className="mt-6 inline-flex">
          <ConnectButton />
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2 text-left">
          <Feat title="Continuous" body="Rewards accrue every second" />
          <Feat title="Transparent" body="80% pool · 20% treasury" />
          <Feat title="On-chain" body="MiningManager smart contract" />
        </div>
      </div>
    </main>
  );
}

function Feat({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <div className="text-xs font-semibold neon-blue">{title}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{body}</div>
    </div>
  );
}

function PlayerPanel({
  balance,
  pending,
  lifetime,
  invested,
  miners,
  dailyRate,
}: {
  balance: number;
  pending: number;
  lifetime: number;
  invested: number;
  miners: number;
  dailyRate: number;
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Your rigs</div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="font-display text-3xl font-bold">{miners}</div>
        <div className="text-xs text-muted-foreground">active miners</div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Row label="Balance" value={`${fmtZk(balance, 4)} zkLTC`} />
        <Row label="Pending" value={`${fmtZk(pending, 6)}`} accent="orange" mono />
        <Row label="Rate / day" value={fmtZk(dailyRate, 4)} accent="blue" mono />
        <Row label="Lifetime" value={fmtZk(lifetime, 4)} mono />
        <Row label="Invested" value={fmtZk(invested, 2)} mono />
        <Row
          label="Next claim"
          value={
            dailyRate > 0
              ? `${Math.max(0, (WITHDRAW_THRESHOLD - pending) / (dailyRate / 86400) / 3600).toFixed(1)}h`
              : "—"
          }
          mono
        />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
  mono,
}: {
  label: string;
  value: string;
  accent?: "blue" | "orange";
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={`${mono ? "font-mono" : ""} text-xs font-semibold ${
          accent === "orange" ? "neon-orange" : accent === "blue" ? "neon-blue" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function PoolStat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="glass flex items-center gap-2 rounded-xl p-3">
      <div className="grid h-8 w-8 place-items-center rounded-lg bg-white/5 text-sky-400 [&_svg]:h-4 [&_svg]:w-4">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="truncate font-mono text-sm font-semibold">{value}</div>
      </div>
    </div>
  );
}
