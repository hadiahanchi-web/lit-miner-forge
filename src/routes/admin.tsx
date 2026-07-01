import { useDocMeta } from "@/lib/head";
import { useEffect, useState } from "react";
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from "wagmi";
import { parseEther } from "viem";
import { toast } from "sonner";
import {
  Loader2,
  Pause,
  Play,
  Plus,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  Wallet2,
} from "lucide-react";

import { MINING_MANAGER_ABI, MINING_MANAGER_ADDRESS } from "@/lib/contract";
import { CONTRACT_DEPLOYED, useBlockRefetch, usePoolInfo } from "@/lib/onchain";
import { fmtBig } from "@/lib/bigformat";

const contract = { address: MINING_MANAGER_ADDRESS, abi: MINING_MANAGER_ABI } as const;

function useIsAuthorizedAdmin(address?: `0x${string}`) {
  const { data, isLoading } = useReadContracts({
    contracts: address
      ? [
          { ...contract, functionName: "owner" },
          { ...contract, functionName: "admins", args: [address] },
        ]
      : [],
    query: { enabled: !!address && CONTRACT_DEPLOYED, refetchInterval: 6000 },
  });
  const owner = (data?.[0]?.result as `0x${string}` | undefined) ?? undefined;
  const isAdmin = (data?.[1]?.result as boolean | undefined) ?? false;
  const isOwner =
    !!address && !!owner && address.toLowerCase() === owner.toLowerCase();
  return { isAuthorized: isOwner || isAdmin, isOwner, owner, isLoading };
}

export default function Admin() {
  useDocMeta(
    "Admin — LiteMiner",
    "On-chain owner controls for the LiteMiner MiningManager contract on LitVM LiteForge testnet.",
  );
  useBlockRefetch();
  const { address } = useAccount();
  const { isAuthorized, isOwner, owner, isLoading } = useIsAuthorizedAdmin(address);
  const {
    rewardPool,
    treasury,
    miningPaused,
    withdrawPaused,
    emissionBps,
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
        <p className="mt-2 text-sm text-muted-foreground">Verifying admin permissions…</p>
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
            The admin panel is restricted to the on-chain contract owner and approved admin wallets.
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
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest ${
            isOwner
              ? "border-orange-500/40 bg-orange-500/10 neon-orange"
              : "border-white/10 bg-white/5 text-muted-foreground"
          }`}
        >
          {isOwner ? "owner" : "admin"}
        </span>
      </div>

      <section className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Reward Pool" value={`${fmtBig(rewardPool, 4)} zkLTC`} accent="blue" />
        <StatCard label="Treasury" value={`${fmtBig(treasury, 4)} zkLTC`} accent="orange" />
        <StatCard label="Emission" value={`${(Number(emissionBps) / 100).toFixed(2)}%`} />
        <StatCard label="Status" value={miningPaused ? "PAUSED" : "LIVE"} accent={miningPaused ? "orange" : "blue"} />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <CircuitBreakers miningPaused={miningPaused} withdrawPaused={withdrawPaused} />
        <FundPool />
        <EmissionCard current={emissionBps} />
        {isOwner && <AdminManagement />}
        {isOwner && <TreasuryWithdraw treasury={treasury} />}
      </div>
    </main>
  );
}

// ---------- Shared write helper ----------
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

// ---------- Circuit Breakers ----------
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
            mineTx({
              ...contract,
              functionName: "setMiningPaused",
              args: [!miningPaused],
            })
          }
        />
        <Toggle
          label="Withdrawals"
          paused={withdrawPaused}
          busy={wd}
          onClick={() =>
            wdTx({
              ...contract,
              functionName: "setWithdrawPaused",
              args: [!withdrawPaused],
            })
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

// ---------- Fund Pool ----------
function FundPool() {
  const [amount, setAmount] = useState("");
  const { send, busy } = useContractWrite("Fund pool");

  return (
    <div className="glass rounded-2xl p-5">
      <h2 className="font-display text-sm font-semibold">Fund Reward Pool</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Send zkLTC directly to the on-chain reward pool.
      </p>
      <div className="mt-3 flex gap-2">
        <input
          type="number"
          min="0"
          step="0.001"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount (zkLTC)"
          className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm font-mono outline-none placeholder:text-muted-foreground focus:border-sky-500/60"
        />
        <button
          disabled={busy}
          onClick={async () => {
            const n = Number(amount);
            if (!isFinite(n) || n <= 0) return toast.error("Enter a positive amount");
            try {
              await send({
                ...contract,
                functionName: "fundRewardPool",
                value: parseEther(amount as `${number}`),
              });
              setAmount("");
            } catch {}
          }}
          className="btn-neon inline-flex items-center gap-1 rounded-xl px-3 py-2 text-sm disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Fund
        </button>
      </div>
    </div>
  );
}

// ---------- Emission ----------
function EmissionCard({ current }: { current: bigint }) {
  const [bps, setBps] = useState<number>(Number(current) || 10000);
  useEffect(() => {
    setBps(Number(current) || 10000);
  }, [current]);
  const { send, busy } = useContractWrite("Set emission");

  return (
    <div className="glass rounded-2xl p-5">
      <h2 className="font-display text-sm font-semibold">Emission multiplier</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Global multiplier applied to per-second rates (bps · max 100000 = 10×).
      </p>
      <div className="mt-4">
        <div className="flex justify-between text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>Value</span>
          <span className="font-mono neon-blue">
            {(bps / 100).toFixed(2)}% · {bps} bps
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={100000}
          step={100}
          value={bps}
          onChange={(e) => setBps(Number(e.target.value))}
          className="w-full accent-sky-400"
        />
        <div className="mt-2 flex items-center gap-2">
          <input
            type="number"
            min={1}
            max={100000}
            step={1}
            value={bps}
            onChange={(e) => {
              const v = Math.floor(Number(e.target.value));
              if (!isFinite(v)) return;
              setBps(Math.max(1, Math.min(100000, v)));
            }}
            className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs outline-none focus:border-sky-500/60"
            placeholder="bps (1–100000)"
          />
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground">bps</span>
        </div>
      </div>

      <button
        disabled={busy}
        onClick={() =>
          send({
            ...contract,
            functionName: "setEmission",
            args: [BigInt(bps)],
          })
        }
        className="btn-neon mt-3 w-full rounded-xl px-3 py-2 text-sm disabled:opacity-50"
      >
        {busy ? "Confirming…" : "Save emission"}
      </button>
    </div>
  );
}

// ---------- Admin Management ----------
function AdminManagement() {
  const [addr, setAddr] = useState("");
  const [removeAddr, setRemoveAddr] = useState("");
  const { send: add, busy: addBusy } = useContractWrite("Add admin");
  const { send: rm, busy: rmBusy } = useContractWrite("Remove admin");

  const isValid = (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v);

  return (
    <div className="glass rounded-2xl p-5 md:col-span-2">
      <h2 className="font-display text-sm font-semibold">Admin management (owner only)</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Grant or revoke admin privileges on-chain.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="flex gap-2">
          <input
            value={addr}
            onChange={(e) => setAddr(e.target.value)}
            placeholder="0x… address to add"
            className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs outline-none focus:border-sky-500/60"
          />
          <button
            disabled={addBusy || !isValid(addr)}
            onClick={async () => {
              try {
                await add({
                  ...contract,
                  functionName: "addAdmin",
                  args: [addr as `0x${string}`],
                });
                setAddr("");
              } catch {}
            }}
            className="btn-neon inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs disabled:opacity-40"
          >
            <UserPlus className="h-3.5 w-3.5" /> Add
          </button>
        </div>
        <div className="flex gap-2">
          <input
            value={removeAddr}
            onChange={(e) => setRemoveAddr(e.target.value)}
            placeholder="0x… address to remove"
            className="flex-1 rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs outline-none focus:border-sky-500/60"
          />
          <button
            disabled={rmBusy || !isValid(removeAddr)}
            onClick={async () => {
              try {
                await rm({
                  ...contract,
                  functionName: "removeAdmin",
                  args: [removeAddr as `0x${string}`],
                });
                setRemoveAddr("");
              } catch {}
            }}
            className="inline-flex items-center gap-1 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-200 hover:bg-red-500/20 disabled:opacity-40"
          >
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Treasury Withdraw ----------
function TreasuryWithdraw({ treasury }: { treasury: bigint }) {
  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const { send, busy } = useContractWrite("Withdraw treasury");
  const { address } = useAccount();

  const { data: liveTreasury } = useReadContract({
    ...contract,
    functionName: "treasury",
    query: { refetchInterval: 5000 },
  });
  const t = (liveTreasury as bigint | undefined) ?? treasury;

  return (
    <div className="glass rounded-2xl p-5 md:col-span-2">
      <h2 className="font-display text-sm font-semibold">Treasury withdraw (owner only)</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Available: <span className="font-mono neon-orange">{fmtBig(t, 6)} zkLTC</span>
      </p>
      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_180px_auto]">
        <input
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="Recipient 0x…"
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs outline-none focus:border-sky-500/60"
        />
        <input
          type="number"
          min="0"
          step="0.001"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Amount"
          className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs outline-none focus:border-sky-500/60"
        />
        <button
          disabled={busy}
          onClick={async () => {
            const n = Number(amount);
            if (!/^0x[a-fA-F0-9]{40}$/.test(to)) return toast.error("Invalid recipient");
            if (!isFinite(n) || n <= 0) return toast.error("Invalid amount");
            try {
              await send({
                ...contract,
                functionName: "withdrawTreasury",
                args: [to as `0x${string}`, parseEther(amount as `${number}`)],
              });
              setAmount("");
            } catch {}
          }}
          className="btn-neon-orange inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs disabled:opacity-40"
        >
          <Wallet2 className="h-3.5 w-3.5" /> Withdraw
        </button>
      </div>
      <button
        onClick={() => setTo(address ?? "")}
        className="mt-2 text-[11px] text-muted-foreground underline"
      >
        Use my address
      </button>
    </div>
  );
}

// ---------- Stat ----------
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
