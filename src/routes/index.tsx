import { Link } from "react-router-dom";
import { useDocMeta } from "@/lib/head";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount, useBalance } from "wagmi";
import { Suspense, lazy, useEffect, useState } from "react";
import {
  Coins,
  Flame,
  Gauge,
  ShoppingBag,
  Trophy,
  Wallet2,
  Zap,
  ArrowRight,
} from "lucide-react";

import {
  CONTRACT_DEPLOYED,
  useBlockRefetch,
  useMiners,
  usePendingRewards,
  usePlayer,
  usePoolInfo,
  useWhaleShare,
} from "@/lib/onchain";
import { fmtBig } from "@/lib/bigformat";
import { shortAddr } from "@/lib/format";

const MiningScene = lazy(() =>
  import("@/components/MiningScene").then((m) => ({ default: m.MiningScene })),
);

export default function Index() {
  useDocMeta(
    "LiteMiner — on-chain zkLTC mining on LitVM LiteForge",
    "Buy on-chain miner NFTs with zkLTC and earn continuous rewards from the MiningManager contract on LitVM LiteForge testnet.",
  );
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useBlockRefetch();
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({ address, query: { refetchInterval: 5000 } });
  const { player } = usePlayer();
  const { pending } = usePendingRewards();
  const { miners } = useMiners();
  const {
    rewardPool,
    treasury,
    availablePool,
    reservedPool,
    miningPaused,
    emissionBps,
    emissionX,
    isLowEmission,
  } = usePoolInfo();
  const whale = useWhaleShare();

  if (!mounted) return <ConnectGate ssrPlaceholder />;
  if (!isConnected || !address) return <ConnectGate />;

  const minerCounts = (player?.minerCounts ?? []).map((n) => Number(n));
  const totalMiners = minerCounts.reduce((a, b) => a + b, 0);
  const baseRate = player?.ratePerSecond ?? 0n;
  const ratePerSec = (baseRate * emissionBps) / 10000n;
  const dailyRate = ratePerSec * 86400n;
  const poolLocked = availablePool === 0n;

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      {!CONTRACT_DEPLOYED && (
        <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">
          MiningManager address is not set. Update <code>src/lib/contract.ts</code>.
        </div>
      )}

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
              minerCounts={miners.map((m) => Number(minerCounts[m.id] ?? 0))}
              running={totalMiners > 0 && !miningPaused}
            />
          </Suspense>
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between p-4">
            <div className="glass rounded-xl px-3 py-1.5">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
                Facility · {shortAddr(address)}
              </div>
              <div className="font-mono text-sm font-semibold neon-blue">
                {totalMiners} rigs on-chain
              </div>
            </div>
            <div className="glass rounded-xl px-3 py-1.5 text-right">
              <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
                Live yield
              </div>
              <div className="font-mono text-sm font-semibold neon-orange">
                {fmtBig(dailyRate, 6)} / day
              </div>
            </div>
          </div>
          {totalMiners === 0 && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="glass max-w-xs rounded-2xl p-4 text-center">
                <div className="text-sm font-semibold">Empty facility</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Head to the Shop to deploy your first on-chain miner.
                </div>
                <Link
                  to="/shop"
                  className="btn-neon mt-3 inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs"
                >
                  <ShoppingBag className="h-3.5 w-3.5" /> Open Shop
                </Link>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Your rig portfolio
              </div>
              <div className="rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold neon-blue">
                on-chain
              </div>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <div className="font-display text-3xl font-bold">{totalMiners}</div>
              <div className="text-xs text-muted-foreground">active miners</div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <Row label="Balance" value={`${fmtBig(bal?.value ?? 0n, 4)} zkLTC`} />
              <Row label="Pending" value={fmtBig(pending, 6)} accent="orange" mono />
              <Row
                label={`Rewards Rate · ${emissionX.toFixed(2)}x`}
                value={fmtBig(ratePerSec, 8)}
                accent="blue"
                mono
              />
              <Row label="Est. daily" value={fmtBig(dailyRate, 5)} accent="blue" mono />
              <Row label="Lifetime" value={fmtBig(player?.lifetimeRewards ?? 0n, 4)} mono />
              <Row label="Invested" value={fmtBig(player?.totalInvested ?? 0n, 3)} mono />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/shop"
              className="btn-neon inline-flex items-center justify-center gap-1.5 rounded-2xl px-3 py-2.5 text-xs font-semibold"
            >
              <ShoppingBag className="h-4 w-4" /> Buy miners <ArrowRight className="h-3 w-3" />
            </Link>
            <Link
              to="/dashboard"
              className="btn-neon-orange inline-flex items-center justify-center gap-1.5 rounded-2xl px-3 py-2.5 text-xs font-semibold"
            >
              <Gauge className="h-4 w-4" /> Claim rewards
            </Link>
          </div>

          <div className="flex flex-wrap gap-1.5 text-[10px] font-mono">
            <Badge tone={isLowEmission ? "warn" : "ok"}>
              {isLowEmission ? "⚠️ Low Rewards Mode" : `Emission ${emissionX.toFixed(2)}x`}
            </Badge>
            <Badge tone={poolLocked ? "warn" : "ok"}>
              {poolLocked ? "⚠️ Pool Protected" : "Pool Live"}
            </Badge>
            {whale.isWhaleBlocked && <Badge tone="err">❌ Whale limit reached</Badge>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <PoolStat label="Reward Pool" value={`${fmtBig(rewardPool, 3)} zkLTC`} icon={<Coins />} />
            <PoolStat label="Available" value={`${fmtBig(availablePool, 3)} zkLTC`} icon={<Zap />} />
            <PoolStat label="Reserved 10%" value={`${fmtBig(reservedPool, 3)} zkLTC`} icon={<Flame />} />
            <PoolStat label="Treasury" value={`${fmtBig(treasury, 3)} zkLTC`} icon={<Wallet2 />} />
            <PoolStat
              label={`Emission ${emissionX.toFixed(2)}x`}
              value={`${(Number(emissionBps) / 100).toFixed(2)}%`}
              icon={<Zap />}
            />
            <PoolStat
              label="Status"
              value={miningPaused ? "PAUSED" : "LIVE"}
              icon={<Wallet2 />}
            />
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Trophy className="h-4 w-4 text-orange-400" />
          <h2 className="font-display text-lg font-semibold">On-chain miner catalog</h2>
          <div className="text-xs text-muted-foreground">
            · dynamic price curve · per-wallet cap · diminishing returns
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {miners.map((m) => {
            const owned = minerCounts[m.id] ?? 0;
            return (
              <div key={m.id} className="glass rounded-2xl p-4">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Tier {m.id}
                  </div>
                  <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] font-mono">
                    {owned} owned
                  </div>
                </div>
                <div className="mt-1 font-display text-lg font-semibold">Miner #{m.id}</div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                  <Row label="Live price" value={`${fmtBig(m.price, 4)} zkLTC`} accent="blue" mono />
                  <Row label="Rate/sec" value={fmtBig((m.ratePerSecond * emissionBps) / 10000n, 8)} mono />
                  <Row label="Rate/day" value={fmtBig((m.ratePerSecond * emissionBps * 86400n) / 10000n, 6)} accent="orange" mono />
                  <Row label="Minted" value={m.totalMintedGlobal.toString()} mono />
                </div>
                <Link
                  to="/shop"
                  className="btn-neon mt-3 inline-flex w-full items-center justify-center gap-1 rounded-xl px-3 py-1.5 text-xs"
                >
                  Buy in Shop <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            );
          })}
        </div>
        {miningPaused && (
          <div className="mt-3 rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 text-sm text-orange-200">
            Mining is currently paused by the contract owner.
          </div>
        )}
      </section>
    </main>
  );
}

function ConnectGate({ ssrPlaceholder }: { ssrPlaceholder?: boolean } = {}) {
  return (
    <main className="mx-auto grid min-h-[calc(100vh-64px)] max-w-3xl place-items-center px-4">
      <div className="glass w-full rounded-3xl p-10 text-center">
        <div className="mx-auto mb-4 h-14 w-14 rounded-2xl bg-gradient-to-br from-sky-400 to-orange-500 shadow-lg shadow-sky-500/30 animate-pulse-glow" />
        <h1 className="font-display text-3xl font-bold">Enter the LiteForge</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Fully on-chain mining on <span className="font-mono neon-blue">LitVM LiteForge · 4441</span>.
          Every miner, reward, price, and pool value comes straight from the MiningManager contract.
        </p>
        <div className="mt-6 inline-flex">
          <ConnectButton />
        </div>
        <div className="mt-6 grid grid-cols-3 gap-2 text-left">
          <Feat title="On-chain miners" body="Prices, rates, cooldowns from the contract" />
          <Feat title="Safe emissions" body="Pool cap per tx · maintenance fee · thresholds" />
          <Feat title="Anti-whale" body="Dynamic price curve · per-wallet cap · diminishing returns" />
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
