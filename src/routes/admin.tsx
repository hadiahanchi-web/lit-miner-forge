import { useDocMeta } from "@/lib/head";
import { useEffect, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { toast } from "sonner";
import { Loader2, Pause, Play, ShieldAlert, ShieldCheck } from "lucide-react";

import { MINING_MANAGER_ABI, MINING_MANAGER_ADDRESS } from "@/lib/contract";
import { CONTRACT_DEPLOYED, useBlockRefetch, usePoolInfo } from "@/lib/onchain";
import { fmtBig } from "@/lib/bigformat";
import { MOBILE_NAV_VARIANTS, useMobileNavVariant } from "@/lib/mobile-nav";

const contract = { address: MINING_MANAGER_ADDRESS, abi: MINING_MANAGER_ABI } as const;

function useIsAuthorizedOwner(address?: `0x${string}`) {
  const { data, isLoading } = useReadContract({
    ...contract,
    functionName: "owner",
    query: { enabled: !!address && CONTRACT_DEPLOYED, refetchInterval: 6000 },
  });
  const owner = (data as `0x${string}` | undefined) ?? undefined;
  const isOwner =
    !!address && !!owner && address.toLowerCase() === owner.toLowerCase();
  return { isAuthorized: isOwner, isOwner, owner, isLoading };
}

export default function Admin() {
  useDocMeta(
    "Admin — LiteMiner",
    "On-chain owner controls for the LiteMiner MiningManager contract on LitVM LiteForge testnet.",
  );
  useBlockRefetch();
  const { address } = useAccount();
  const { isAuthorized, isOwner, owner, isLoading } = useIsAuthorizedOwner(address);
  const {
    rewardPool,
    treasury,
    availablePool,
    reservedPool,
    miningPaused,
    withdrawPaused,
    emissionBps,
    emissionMax,
    emissionX,
    isLowEmission,
  } = usePoolInfo();

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
        <p className="text-sm text-muted-foreground">Contract not deployed.</p>
      </main>
    );
  }
  if (isLoading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <Loader2 className="mx-auto h-6 w-6 animate-spin text-sky-400" />
        <p className="mt-2 text-sm text-muted-foreground">Verifying owner permissions…</p>
      </main>
    );
  }
  if (!isAuthorized) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16">
        <div className="glass rounded-2xl border border-red-500/30 p-8 text-center">
          <ShieldAlert className="mx-auto h-10 w-10 text-red-400" />
          <h1 className="mt-3 font-display text-xl font-semibold">Access denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The admin panel is restricted to the on-chain contract owner.
          </p>
          <div className="mt-4 space-y-1 font-mono text-[11px] text-muted-foreground">
            <div>You: {address}</div>
            {owner && <div>Owner: {owner}</div>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <ShieldCheck className="h-5 w-5 neon-blue" />
        <h1 className="font-display text-2xl font-bold">Protocol Admin</h1>
        <span className="ml-2 rounded-full border border-sky-500/40 bg-sky-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest neon-blue">
          on-chain
        </span>
        <span className="rounded-full border border-orange-500/40 bg-orange-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest neon-orange">
          owner
        </span>
        {isLowEmission && (
          <span className="rounded-full border border-yellow-500/40 bg-yellow-500/10 px-2 py-0.5 text-[10px] uppercase tracking-widest text-yellow-200">
            ⚠️ Low Rewards Mode
          </span>
        )}
      </div>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Reward Pool" value={`${fmtBig(rewardPool, 4)} zkLTC`} accent="blue" />
        <StatCard label="Available Pool" value={`${fmtBig(availablePool, 4)} zkLTC`} accent="blue" />
        <StatCard label="Reserved (10%)" value={`${fmtBig(reservedPool, 4)} zkLTC`} />
        <StatCard label="Treasury" value={`${fmtBig(treasury, 4)} zkLTC`} accent="orange" />
        <StatCard label="Emission" value={`${emissionX.toFixed(2)}x · ${(Number(emissionBps) / 100).toFixed(2)}%`} />
        <StatCard label="Emission max" value={`${(Number(emissionMax) / 100).toFixed(0)}%`} />
        <StatCard label="Mining" value={miningPaused ? "PAUSED" : "LIVE"} accent={miningPaused ? "orange" : "blue"} />
        <StatCard label="Withdrawals" value={withdrawPaused ? "PAUSED" : "LIVE"} accent={withdrawPaused ? "orange" : "blue"} />
      </section>

      <div className="mb-4 rounded-xl border border-white/10 bg-black/20 p-4 text-xs text-muted-foreground">
        <b className="text-foreground">Dynamic emission:</b> the contract auto-scales emission based on
        TVL (rewardPool). As pool grows toward the TVL cap, emission decays from{" "}
        <span className="neon-blue">{(Number(emissionMax) / 100).toFixed(0)}%</span> → the configured
        minimum. No manual setter is available in v6.
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CircuitBreakers miningPaused={miningPaused} withdrawPaused={withdrawPaused} />
        <MobileNavCard />
      </div>
    </main>
  );
}

function useContractWrite(label: string) {
  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}` | undefined>();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });
  useEffect(() => {
    if (isSuccess) toast.success(`${label} confirmed`);
  }, [isSuccess, label]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function send(args: any) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const h = await writeContractAsync(args as any);
      setHash(h);
      toast.info(`${label} submitted…`);
      return h;
    } catch (e) {
      toast.error((e as Error).message?.slice(0, 160) ?? "Transaction failed");
      throw e;
    }
  }
  return { send, busy: isPending || isConfirming };
}

function CircuitBreakers({
  miningPaused,
  withdrawPaused,
}: {
  miningPaused: boolean;
  withdrawPaused: boolean;
}) {
  const { send: mineTx, busy: mining } = useContractWrite("Mining toggle");
  const { send: wdTx, busy: wd } = useContractWrite("Withdraw toggle");
  return (
    <div className="glass rounded-2xl p-5">
      <h2 className="font-display text-sm font-semibold">Circuit breakers</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Emergency on-chain pause for buys and withdrawals.
      </p>
      <div className="mt-4 space-y-2">
        <Toggle
          label="Mining"
          paused={miningPaused}
          busy={mining}
          onClick={() =>
            mineTx({ ...contract, functionName: "setMiningPaused", args: [!miningPaused] })
          }
        />
        <Toggle
          label="Withdrawals"
          paused={withdrawPaused}
          busy={wd}
          onClick={() =>
            wdTx({ ...contract, functionName: "setWithdrawPaused", args: [!withdrawPaused] })
          }
        />
      </div>
    </div>
  );
}

function Toggle({
  label,
  paused,
  onClick,
  busy,
}: {
  label: string;
  paused: boolean;
  onClick: () => void;
  busy: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-sm transition disabled:opacity-50 ${
        paused
          ? "border-orange-500/40 bg-orange-500/10 neon-orange"
          : "border-sky-500/40 bg-sky-500/10 neon-blue"
      }`}
    >
      <span className="font-semibold">{label}</span>
      <span className="inline-flex items-center gap-2 font-mono text-xs">
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : paused ? (
          <Play className="h-3.5 w-3.5" />
        ) : (
          <Pause className="h-3.5 w-3.5" />
        )}
        {busy ? "…" : paused ? "Resume" : "Pause"}
      </span>
    </button>
  );
}

function MobileNavCard() {
  const [variant, setVariant] = useMobileNavVariant();
  return (
    <div className="glass rounded-2xl p-5">
      <h2 className="font-display text-sm font-semibold">Mobile navigation style</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Choose how the mobile menu appears. Applies instantly to all clients on this device.
      </p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {MOBILE_NAV_VARIANTS.map((v) => (
          <button
            key={v.id}
            onClick={() => setVariant(v.id)}
            className={`rounded-xl border px-2 py-3 text-xs transition ${
              variant === v.id
                ? "border-sky-500/60 bg-sky-500/10 neon-blue"
                : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
            }`}
          >
            <div className="font-semibold">{v.label}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">{v.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "blue" | "orange";
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-mono text-sm font-semibold ${
          accent === "orange" ? "neon-orange" : accent === "blue" ? "neon-blue" : "text-foreground"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
