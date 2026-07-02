import { useDocMeta } from "@/lib/head";
import { useAccount, useBalance, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { toast } from "sonner";
import { Lock, Loader2, ShoppingBag, Package, Timer, TrendingUp } from "lucide-react";
import { useEffect, useState } from "react";

import { MINING_MANAGER_ABI, MINING_MANAGER_ADDRESS } from "@/lib/contract";
import {
  CONTRACT_DEPLOYED,
  useBlockRefetch,
  useCooldown,
  useMiners,
  usePlayer,
  usePoolInfo,
  type OnChainMiner,
} from "@/lib/onchain";
import { fmtBig } from "@/lib/bigformat";
import { MINERS } from "@/lib/miners";

export default function ShopPage() {
  useDocMeta("Shop — LiteMiner", "Buy on-chain zkLTC miners from LiteMiner MiningManager.");
  useBlockRefetch();
  const { address, isConnected } = useAccount();
  const { data: bal } = useBalance({ address, query: { refetchInterval: 5000 } });
  const { miners, isLoading: minersLoading } = useMiners();
  const { player } = usePlayer();
  const { miningPaused, emissionBps } = usePoolInfo();
  const { lastAction, cooldown } = useCooldown();

  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);
  const cooldownRemaining = Math.max(0, Number(lastAction + cooldown) - nowSec);

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">
            <ShoppingBag className="mr-2 inline h-7 w-7 text-orange-400" />
            Miner Shop
          </h1>
          <p className="text-sm text-muted-foreground">
            All prices, rates and locks are read live from the on-chain <b>V3MiningCore</b>.
            You pay in <b>zkLTC</b>; mining rewards are minted as <b>LFR</b> and backed 1:1 by the vault.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {miningPaused && (
            <span className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-red-300">
              Mining paused
            </span>
          )}
          {cooldownRemaining > 0 && (
            <span className="rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-orange-200">
              <Timer className="mr-1 inline h-3 w-3" /> Cooldown {cooldownRemaining}s
            </span>
          )}
        </div>
      </header>

      {!CONTRACT_DEPLOYED && <NotDeployedBanner />}

      {minersLoading ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-sky-400" />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {miners.map((m) => (
            <MinerShopCard
              key={m.id}
              miner={m}
              connected={isConnected}
              balance={bal?.value ?? 0n}
              ownedCount={player?.minerCounts?.[m.id] ?? 0n}
              player={player}
              miningPaused={miningPaused}
              emissionBps={emissionBps}
              cooldownRemaining={cooldownRemaining}
            />
          ))}
        </div>
      )}
    </main>
  );
}

function MinerShopCard({
  miner,
  connected,
  balance,
  ownedCount,
  player,
  miningPaused,
  emissionBps,
  cooldownRemaining,
}: {
  miner: OnChainMiner;
  connected: boolean;
  balance: bigint;
  ownedCount: bigint;
  player: ReturnType<typeof usePlayer>["player"];
  miningPaused: boolean;
  emissionBps: bigint;
  cooldownRemaining: number;
}) {
  const { writeContractAsync, isPending } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  useEffect(() => {
    if (isSuccess) toast.success(`Deployed miner #${miner.id}`);
  }, [isSuccess, miner.id]);

  // Unlock: requires ownership of unlockRequiresId AND totalInvested >= unlockMinInvested
  const requiresId = miner.unlockRequiresId;
  const requiresIdIsSentinel = requiresId > 1_000_000n;
  const meetsPrereq =
    requiresIdIsSentinel
      ? true
      : (player?.minerCounts?.[Number(requiresId)] ?? 0n) > 0n;
  const meetsInvest = (player?.totalInvested ?? 0n) >= miner.unlockMinInvested;
  const unlocked = miner.active && meetsPrereq && meetsInvest;

  const canAfford = balance >= miner.price;
  const disabled =
    !connected ||
    !unlocked ||
    !canAfford ||
    miningPaused ||
    cooldownRemaining > 0 ||
    isPending ||
    isConfirming;

  async function onBuy() {
    try {
      const hash = await writeContractAsync({
        address: MINING_MANAGER_ADDRESS,
        abi: MINING_MANAGER_ABI,
        functionName: "buyMiner",
        args: [BigInt(miner.id)],
        value: miner.price,
      });
      setTxHash(hash);
      toast.info("Transaction submitted…");
    } catch (e) {
      toast.error((e as Error).message?.slice(0, 140) ?? "Transaction failed");
    }
  }

  const ratePerSec = (miner.ratePerSecond * emissionBps) / 10000n;
  const ratePerDay = ratePerSec * 86400n;

  const meta = MINERS[miner.id];
  return (
    <div className="glass relative flex flex-col overflow-hidden rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {meta?.image && (
            <img
              src={meta.image}
              alt={meta.name}
              loading="lazy"
              width={64}
              height={64}
              className="h-16 w-16 rounded-xl border border-white/10 bg-black/30 object-contain p-1"
            />
          )}
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Tier {miner.id} {miner.active ? "" : "· inactive"}
            </div>
            <div className="font-display text-lg font-semibold">
              <Package className="mr-1.5 inline h-4 w-4 text-sky-400" />
              {meta?.name ?? `Miner #${miner.id}`}
            </div>
          </div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-mono">
          {ownedCount.toString()} owned
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <Metric label="Live price" value={`${fmtBig(miner.price, 5)} zkLTC`} highlight />
        <Metric label="Base price" value={`${fmtBig(miner.basePrice, 5)} zkLTC`} />
        <Metric label="Rate / sec" value={fmtBig(ratePerSec, 8)} />
        <Metric label="Rate / day" value={fmtBig(ratePerDay, 6)} />
        <Metric label="Global minted" value={miner.totalMintedGlobal.toString()} />
        <Metric
          label="Min invested"
          value={miner.unlockMinInvested === 0n ? "—" : `${fmtBig(miner.unlockMinInvested, 3)}`}
        />
      </div>

      {!unlocked && (
        <div className="mt-3 rounded-lg border border-orange-500/30 bg-orange-500/5 px-2.5 py-1.5 text-[11px] text-orange-200">
          <Lock className="mr-1 inline h-3 w-3" />
          {!miner.active
            ? "Inactive"
            : !meetsPrereq
              ? `Requires ${MINERS[Number(requiresId)]?.name ?? `Miner #${requiresId.toString()}`}`
              : `Requires ${fmtBig(miner.unlockMinInvested, 3)} zkLTC invested`}
        </div>
      )}

      <button
        disabled={disabled}
        onClick={onBuy}
        className="btn-neon mt-4 inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isPending || isConfirming ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Confirming…
          </>
        ) : !connected ? (
          "Connect wallet"
        ) : !unlocked ? (
          <>
            <Lock className="h-3.5 w-3.5" /> Locked
          </>
        ) : !canAfford ? (
          `Need ${fmtBig(miner.price, 4)} zkLTC`
        ) : cooldownRemaining > 0 ? (
          `Cooldown ${cooldownRemaining}s`
        ) : miningPaused ? (
          "Paused"
        ) : (
          <>
            <TrendingUp className="h-4 w-4" /> Buy · {fmtBig(miner.price, 5)} zkLTC
          </>
        )}
      </button>
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-white/5 bg-black/20 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`font-mono text-xs ${highlight ? "neon-blue" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}

function NotDeployedBanner() {
  return (
    <div className="mb-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm text-yellow-100">
      V3 contracts are not deployed yet. Run <code className="font-mono">contracts/scripts/deploy-v3.ts</code>
      {" "}and paste the five addresses into <code className="font-mono">src/lib/contract.ts</code> (or set{" "}
      <code>VITE_CORE_ADDRESS</code>, <code>VITE_TOKEN_ADDRESS</code>, <code>VITE_TREASURY_ADDRESS</code>,{" "}
      <code>VITE_RISK_ADDRESS</code>, <code>VITE_ORACLE_ADDRESS</code>).
    </div>
  );
}
