import { useDocMeta } from "@/lib/head";
import { useEffect, useState } from "react";
import {
  useAccount,
  useReadContract,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { parseEther } from "viem";
import { toast } from "sonner";
import { Loader2, Pause, Play, ShieldAlert, ShieldCheck } from "lucide-react";

import {
  CORE_ABI,
  CORE_ADDRESS,
  ORACLE_ABI,
  ORACLE_ADDRESS,
  RISK_ABI,
  RISK_ADDRESS,
  TOKEN_ADDRESS,
  TREASURY_ABI,
  TREASURY_ADDRESS,
} from "@/lib/contract";
import { CONTRACT_DEPLOYED, useBlockRefetch, usePoolInfo } from "@/lib/onchain";
import { fmtBig } from "@/lib/bigformat";
import { MOBILE_NAV_VARIANTS, useMobileNavVariant } from "@/lib/mobile-nav";

const core = { address: CORE_ADDRESS, abi: CORE_ABI } as const;
const oracle = { address: ORACLE_ADDRESS, abi: ORACLE_ABI } as const;
const risk = { address: RISK_ADDRESS, abi: RISK_ABI } as const;
const vault = { address: TREASURY_ADDRESS, abi: TREASURY_ABI } as const;

function useIsAuthorizedOwner(address?: `0x${string}`) {
  const { data, isLoading } = useReadContract({
    ...core,
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
    "Owner controls for LiteMiner V3 (Core / Vault / Oracle / Risk) on LitVM LiteForge.",
  );
  useBlockRefetch();
  const { address } = useAccount();
  const { isAuthorized, owner, isLoading } = useIsAuthorizedOwner(address);
  const {
    rewardPool,
    reservePool,
    devPool,
    availablePool,
    miningPaused,
    withdrawPaused,
    emissionBps,
    emissionMax,
    emissionMin,
    tvlCap,
    tvlNow,
    activeUsers,
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
        <p className="text-sm text-muted-foreground">V3 contracts not deployed.</p>
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
            The admin panel is restricted to the on-chain Core owner.
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
        <h1 className="font-display text-2xl font-bold">Protocol Admin · V3</h1>
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
        <StatCard label="Reserved (10%)" value={`${fmtBig(reservePool, 4)} zkLTC`} />
        <StatCard label="Dev Pool" value={`${fmtBig(devPool, 4)} zkLTC`} accent="orange" />
        <StatCard label="Emission" value={`${emissionX.toFixed(2)}x · ${(Number(emissionBps) / 100).toFixed(2)}%`} />
        <StatCard label="Oracle TVL" value={`${fmtBig(tvlNow, 3)} / ${fmtBig(tvlCap, 3)}`} />
        <StatCard label="Mining" value={miningPaused ? "PAUSED" : "LIVE"} accent={miningPaused ? "orange" : "blue"} />
        <StatCard label="Withdrawals" value={withdrawPaused ? "PAUSED" : "LIVE"} accent={withdrawPaused ? "orange" : "blue"} />
      </section>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <AddrCard label="Core (proxy)" address={CORE_ADDRESS} />
        <AddrCard label="RewardToken (LFR)" address={TOKEN_ADDRESS} />
        <AddrCard label="TreasuryVault" address={TREASURY_ADDRESS} />
        <AddrCard label="EmissionOracle" address={ORACLE_ADDRESS} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <CircuitBreakers miningPaused={miningPaused} withdrawPaused={withdrawPaused} />
        <OracleCard emissionMax={emissionMax} emissionMin={emissionMin} tvlCap={tvlCap} />
        <RiskCard />
        <TreasuryCard devPool={devPool} />
        <MobileNavCard />
        <SystemCard activeUsers={activeUsers} />
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
        Emergency on-chain pause for buys and withdrawals (Core).
      </p>
      <div className="mt-4 space-y-2">
        <Toggle
          label="Mining"
          paused={miningPaused}
          busy={mining}
          onClick={() =>
            mineTx({ ...core, functionName: "setMiningPaused", args: [!miningPaused] })
          }
        />
        <Toggle
          label="Withdrawals"
          paused={withdrawPaused}
          busy={wd}
          onClick={() =>
            wdTx({ ...core, functionName: "setWithdrawPaused", args: [!withdrawPaused] })
          }
        />
      </div>
    </div>
  );
}

function OracleCard({
  emissionMax,
  emissionMin,
  tvlCap,
}: {
  emissionMax: bigint;
  emissionMin: bigint;
  tvlCap: bigint;
}) {
  const { send, busy } = useContractWrite("Oracle setCurve");
  const [base, setBase] = useState<string>("");
  const [min, setMin] = useState<string>("");
  const [cap, setCap] = useState<string>("");

  useEffect(() => {
    if (base === "") setBase(emissionMax.toString());
  }, [emissionMax, base]);
  useEffect(() => {
    if (min === "") setMin(emissionMin.toString());
  }, [emissionMin, min]);
  useEffect(() => {
    if (cap === "" && tvlCap > 0n) setCap((Number(tvlCap) / 1e18).toString());
  }, [tvlCap, cap]);

  async function submit() {
    try {
      const b = BigInt(base || "0");
      const m = BigInt(min || "0");
      const c = parseEther(cap || "0");
      await send({ ...oracle, functionName: "setCurve", args: [b, m, c] });
    } catch {
      /* toast handled */
    }
  }

  return (
    <div className="glass rounded-2xl p-5">
      <h2 className="font-display text-sm font-semibold">Emission curve (Oracle)</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        base / min are bps (10000 = 1x). capTVL is zkLTC. Emission decays as reward pool grows toward capTVL.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <NumField label="base (bps)" value={base} onChange={setBase} />
        <NumField label="min (bps)" value={min} onChange={setMin} />
        <NumField label="capTVL (zkLTC)" value={cap} onChange={setCap} />
      </div>
      <button
        disabled={busy}
        onClick={submit}
        className="btn-neon mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs disabled:opacity-40"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Update curve
      </button>
    </div>
  );
}

function RiskCard() {
  const { send, busy } = useContractWrite("Risk setMaxScore");
  const { data: maxScore } = useReadContract({
    ...risk,
    functionName: "maxScore",
    query: { enabled: CONTRACT_DEPLOYED, refetchInterval: 6000 },
  });
  const [v, setV] = useState<string>("");
  useEffect(() => {
    if (v === "" && maxScore !== undefined) setV((maxScore as bigint).toString());
  }, [maxScore, v]);
  return (
    <div className="glass rounded-2xl p-5">
      <h2 className="font-display text-sm font-semibold">Risk engine</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Threshold at which an address is blocked from claiming.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
        <NumField label="maxScore" value={v} onChange={setV} />
        <button
          disabled={busy}
          onClick={() => send({ ...risk, functionName: "setMaxScore", args: [BigInt(v || "0")] })}
          className="btn-neon self-end rounded-xl px-4 py-2 text-xs disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Update"}
        </button>
      </div>
    </div>
  );
}

function TreasuryCard({ devPool }: { devPool: bigint }) {
  const { send, busy } = useContractWrite("Withdraw dev pool");
  const { address } = useAccount();
  const [to, setTo] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  useEffect(() => {
    if (to === "" && address) setTo(address);
  }, [address, to]);
  return (
    <div className="glass rounded-2xl p-5">
      <h2 className="font-display text-sm font-semibold">Treasury (dev pool)</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Withdraw from the dev pool. Available: <b>{fmtBig(devPool, 5)}</b> zkLTC.
      </p>
      <div className="mt-3 grid gap-2">
        <NumField label="to (address)" value={to} onChange={setTo} />
        <NumField label="amount (zkLTC)" value={amount} onChange={setAmount} />
      </div>
      <button
        disabled={busy || !to || !amount}
        onClick={() =>
          send({
            ...vault,
            functionName: "withdrawDev",
            args: [to as `0x${string}`, parseEther(amount || "0")],
          })
        }
        className="btn-neon-orange mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs disabled:opacity-40"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        Withdraw
      </button>
    </div>
  );
}

function SystemCard({ activeUsers }: { activeUsers: bigint }) {
  return (
    <div className="glass rounded-2xl p-5">
      <h2 className="font-display text-sm font-semibold">Live system</h2>
      <div className="mt-3 grid gap-2 text-xs">
        <Row label="Active users (oracle)" value={activeUsers.toString()} />
        <Row label="Core proxy" value={CORE_ADDRESS} mono />
        <Row label="Upgrade" value="Deploy new impl + upgradeToAndCall (UUPS)" />
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
        Choose how the mobile menu appears. Applies instantly on this device.
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

function AddrCard({ label, address }: { label: string; address: string }) {
  return (
    <div className="glass rounded-2xl p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-[11px]">{address}</div>
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

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-sky-500/60"
      />
    </label>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-white/5 bg-black/20 px-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
