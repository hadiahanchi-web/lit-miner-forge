import { createFileRoute } from "@tanstack/react-router";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance } from "wagmi";
import { Suspense, lazy, useEffect } from "react";
import { toast } from "sonner";

import { MinerCard } from "@/components/MinerCard";
import { MissionsPanel } from "@/components/MissionsPanel";
import { ReferralPanel } from "@/components/ReferralPanel";
import { AchievementsPanel } from "@/components/AchievementsPanel";
import { DailyRewards } from "@/components/DailyRewards";
import { PoolHealth } from "@/components/PoolHealth";
import {
  MINERS,
  WITHDRAW_THRESHOLD,
  playerLevel,
  DURABILITY_MAX,
  WALLET_ENERGY_MAX,
} from "@/lib/miners";
import { useMiningState } from "@/lib/mining-state";
import { fmtZk } from "@/lib/format";
import {
  BatteryCharging,
  CircuitBoard,
  Coins,
  Flame,
  Gauge,
  Wallet2,
  Wrench,
  Zap,
} from "lucide-react";

const MiningScene = lazy(() =>
  import("@/components/MiningScene").then((m) => ({ default: m.MiningScene })),
);

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "LiteMiner — sustainable zkLTC mining on LitVM LiteForge" },
      {
        name: "description",
        content:
          "Buy virtual mining rigs with zkLTC, manage energy and durability, and earn from a daily reward budget on the LitVM LiteForge testnet.",
      },
    ],
  }),
  component: Index,
});

function useReferrerFromUrl() {
  if (typeof window === "undefined") return undefined;
  const u = new URL(window.location.href);
  const ref = u.searchParams.get("ref");
  return ref && /^0x[a-fA-F0-9]{40}$/.test(ref) ? ref : undefined;
}

function Index() {
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({ address });
  const balance = bal ? Number(bal.value) / 1e18 : 0;

  const {
    player,
    pool,
    livePending,
    ratePerSecond,
    baseRatePerSecond,
    poolHealth: health,
    emissionMultiplier: emission,
    epochCapRemaining,
    epochBudgetRemaining,
    epochBudget,
    register,
    buyMiner,
    upgradeMiner,
    claim,
    repairAll,
    refillEnergy,
    openChest,
    spin,
  } = useMiningState(address);

  useEffect(() => {
    if (isConnected && address) {
      register(useReferrerFromUrl());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  if (!isConnected || !address) return <ConnectGate />;

  const totalMiners = player?.minerCounts.reduce((a, b) => a + b, 0) ?? 0;
  const dailyRate = ratePerSecond * 86_400;
  const maxDailyRate = baseRatePerSecond * 86_400;
  const efficiency = maxDailyRate > 0 ? Math.round((dailyRate / maxDailyRate) * 100) : 100;
  const canClaim = livePending >= WITHDRAW_THRESHOLD;
  const level = playerLevel(player?.totalInvested ?? 0);
  const walletEnergyPct = Math.round(((player?.walletEnergy ?? 0) / WALLET_ENERGY_MAX) * 100);
  const budgetPct = epochBudget > 0 ? Math.round((epochBudgetRemaining / epochBudget) * 100) : 100;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
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
              running={totalMiners > 0 && emission > 0 && (player?.walletEnergy ?? 0) > 0}
            />
          </Suspense>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <div className="glass rounded-xl px-3 py-1.5">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
                Facility · Lv {level}
              </div>
              <div className="font-mono text-sm font-semibold neon-blue">
                {totalMiners} rigs · {efficiency}% eff
              </div>
            </div>
            <div className="glass rounded-xl px-3 py-1.5 text-right">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
                Live yield
              </div>
              <div className="font-mono text-sm font-semibold neon-orange">
                {fmtZk(dailyRate, 5)} / day
              </div>
            </div>
          </div>
          {totalMiners === 0 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="glass max-w-xs rounded-2xl p-4 text-center">
                <div className="text-sm font-semibold">Empty facility</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Deploy your first Basic USB Miner for just 0.01 zkLTC to begin.
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <PlayerPanel
            balance={balance}
            pending={livePending}
            lifetime={player?.lifetimeRewards ?? 0}
            invested={player?.totalInvested ?? 0}
            miners={totalMiners}
            dailyRate={dailyRate}
            efficiency={efficiency}
            level={level}
            walletEnergyPct={walletEnergyPct}
            uptimeSec={player?.uptimeSec ?? 0}
            epochCapRemaining={epochCapRemaining}
          />
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => {
                try {
                  const { net, fee } = claim();
                  toast.success("Rewards claimed", {
                    description: `+${fmtZk(net, 6)} zkLTC (fee ${fmtZk(fee, 6)})`,
                  });
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
              disabled={!canClaim}
              className="btn-neon-orange col-span-3 rounded-2xl px-4 py-3 text-sm"
            >
              {canClaim ? `Claim ${fmtZk(livePending, 6)}` : `Min ${WITHDRAW_THRESHOLD} zkLTC`}
            </button>
            <button
              onClick={() => {
                try {
                  const cost = repairAll();
                  toast.success("Rigs repaired", { description: `-${fmtZk(cost, 5)} zkLTC` });
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold transition hover:bg-white/10"
            >
              <Wrench className="h-3.5 w-3.5 neon-blue" /> Repair
            </button>
            <button
              onClick={() => {
                try {
                  const cost = refillEnergy();
                  toast.success("Energy refilled", { description: `-${fmtZk(cost, 5)} zkLTC` });
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold transition hover:bg-white/10"
            >
              <BatteryCharging className="h-3.5 w-3.5 neon-orange" /> Energy
            </button>
            <button
              disabled
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/5 px-3 py-2.5 text-[10px] font-semibold text-muted-foreground"
            >
              <Zap className="h-3.5 w-3.5" /> {walletEnergyPct}%
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <PoolStat label="Reward Pool" value={fmtZk(pool.rewardPool, 2)} icon={<Coins />} />
            <PoolStat label="Treasury" value={fmtZk(pool.treasury, 2)} icon={<Flame />} />
            <PoolStat label="Daily Budget" value={`${budgetPct}%`} icon={<Gauge />} />
            <PoolStat label="Deposits" value={fmtZk(pool.totalDeposits, 2)} icon={<Wallet2 />} />
          </div>
        </div>
      </section>

      {/* Health + Daily engagement */}
      <section className="mt-6 grid gap-3 md:grid-cols-3">
        <PoolHealth
          health={health}
          emission={emission}
          budgetRemaining={epochBudgetRemaining}
          budgetTotal={epochBudget}
        />
        <MissionsPanel player={player} />
        <DailyRewards player={player} openChest={openChest} spin={spin} />
      </section>

      <section className="mt-3 grid gap-3 md:grid-cols-2">
        <ReferralPanel address={address} player={player} />
        <AchievementsPanel player={player} />
      </section>

      {/* Marketplace */}
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <CircuitBoard className="h-4 w-4 text-sky-400" />
          <h2 className="font-display text-lg font-semibold">Rig Marketplace</h2>
          <div className="text-xs text-muted-foreground">
            · +25% rate / level · Durability drains with use · Repair required
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
          {MINERS.map((m) => (
            <MinerCard
              key={m.id}
              miner={m}
              owned={player?.minerCounts[m.id] ?? 0}
              level={player?.minerLevels[m.id] ?? 0}
              durability={player?.minerDurability[m.id] ?? DURABILITY_MAX}
              player={player}
              balance={balance}
              onBuy={buyMiner}
              onUpgrade={upgradeMiner}
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
          Connect a wallet on chain <span className="font-mono neon-blue">4441</span> and start
          mining zkLTC from just 0.01 zkLTC — with a sustainable daily reward budget and per-wallet caps.
        </p>
        <div className="mt-6 inline-flex">
          <ConnectButton />
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2 text-left">
          <Feat title="Daily budget" body="5% of pool per epoch — no runaway inflation" />
          <Feat title="Energy & repair" body="Durability, wallet energy, cooldowns" />
          <Feat title="Fair caps" body="1% of daily budget per wallet · 1 claim / epoch" />
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
  efficiency,
  level,
  walletEnergyPct,
  uptimeSec,
  epochCapRemaining,
}: {
  balance: number;
  pending: number;
  lifetime: number;
  invested: number;
  miners: number;
  dailyRate: number;
  efficiency: number;
  level: number;
  walletEnergyPct: number;
  uptimeSec: number;
  epochCapRemaining: number;
}) {
  const uptimeHrs = (uptimeSec / 3600).toFixed(1);
  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Your rigs</div>
        <div className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold neon-blue">
          Lv {level}
        </div>
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <div className="font-display text-3xl font-bold">{miners}</div>
        <div className="text-xs text-muted-foreground">active miners</div>
      </div>
      {/* Wallet energy bar */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Zap className="h-3 w-3" /> Wallet energy</span>
          <span className="font-mono">{walletEnergyPct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
          <div
            className="h-full transition-all"
            style={{
              width: `${walletEnergyPct}%`,
              background:
                walletEnergyPct > 40
                  ? "linear-gradient(90deg,#38bdf8,#22d3ee)"
                  : "linear-gradient(90deg,#f97316,#ef4444)",
            }}
          />
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Row label="Balance" value={`${fmtZk(balance, 4)} zkLTC`} />
        <Row label="Pending" value={`${fmtZk(pending, 6)}`} accent="orange" mono />
        <Row label="Est. daily" value={fmtZk(dailyRate, 5)} accent="blue" mono />
        <Row label="Efficiency" value={`${efficiency}%`} accent={efficiency >= 75 ? "blue" : "orange"} mono />
        <Row label="Uptime" value={`${uptimeHrs} h`} mono />
        <Row label="Epoch cap left" value={fmtZk(epochCapRemaining, 5)} accent="orange" mono />
        <Row label="Lifetime" value={fmtZk(lifetime, 4)} mono />
        <Row label="Invested" value={fmtZk(invested, 2)} mono />
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
