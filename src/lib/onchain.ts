import { useAccount, useReadContract, useReadContracts, useBlockNumber } from "wagmi";
import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MINING_MANAGER_ABI, MINING_MANAGER_ADDRESS } from "./contract";

const contract = { address: MINING_MANAGER_ADDRESS, abi: MINING_MANAGER_ABI } as const;

/** Auto-refresh all wagmi reads on every new block. */
export function useBlockRefetch() {
  const { data: block } = useBlockNumber({ watch: true });
  const qc = useQueryClient();
  useEffect(() => {
    qc.invalidateQueries({ queryKey: ["readContract"] });
    qc.invalidateQueries({ queryKey: ["readContracts"] });
  }, [block, qc]);
}

export function usePoolInfo() {
  const { data, isLoading } = useReadContracts({
    contracts: [
      { ...contract, functionName: "rewardPool" },
      { ...contract, functionName: "treasury" },
      { ...contract, functionName: "miningPaused" },
      { ...contract, functionName: "withdrawPaused" },
      { ...contract, functionName: "WITHDRAW_THRESHOLD" },
      { ...contract, functionName: "MAX_CLAIM_POOL_BPS" },
      { ...contract, functionName: "MAINTENANCE_BPS" },
      { ...contract, functionName: "emissionRatePerSecondGlobal" },
    ],
  });
  return {
    isLoading,
    rewardPool: (data?.[0]?.result as bigint | undefined) ?? 0n,
    treasury: (data?.[1]?.result as bigint | undefined) ?? 0n,
    miningPaused: (data?.[2]?.result as boolean | undefined) ?? false,
    withdrawPaused: (data?.[3]?.result as boolean | undefined) ?? false,
    withdrawThreshold: (data?.[4]?.result as bigint | undefined) ?? 0n,
    maxClaimPoolBps: (data?.[5]?.result as bigint | undefined) ?? 0n,
    maintenanceBps: (data?.[6]?.result as bigint | undefined) ?? 0n,
    emissionBps: (data?.[7]?.result as bigint | undefined) ?? 10000n,
  };
}

export type OnChainMiner = {
  id: number;
  price: bigint;
  basePrice: bigint;
  ratePerSecond: bigint;
  unlockRequiresId: bigint;
  unlockMinInvested: bigint;
  active: boolean;
  totalMintedGlobal: bigint;
};

export function useMiners() {
  const { data: count } = useReadContract({
    ...contract,
    functionName: "minersCount",
  });
  const n = Number(count ?? 0n);
  const { data, isLoading } = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({
      ...contract,
      functionName: "getMiner" as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: n > 0 },
  });
  const miners: OnChainMiner[] = useMemo(() => {
    if (!data) return [];
    return data.map((d, i) => {
      const r = (d.result ?? []) as readonly [bigint, bigint, bigint, bigint, bigint, boolean, bigint];
      return {
        id: i,
        price: r?.[0] ?? 0n,
        basePrice: r?.[1] ?? 0n,
        ratePerSecond: r?.[2] ?? 0n,
        unlockRequiresId: r?.[3] ?? 0n,
        unlockMinInvested: r?.[4] ?? 0n,
        active: r?.[5] ?? false,
        totalMintedGlobal: r?.[6] ?? 0n,
      };
    });
  }, [data]);
  return { miners, isLoading };
}

export type OnChainPlayer = {
  registered: boolean;
  totalInvested: bigint;
  lifetimeRewards: bigint;
  lastUpdate: bigint;
  pending: bigint;
  ratePerSecond: bigint;
  minerCounts: readonly bigint[];
  minerLevels: readonly bigint[];
};

export function usePlayer() {
  const { address } = useAccount();
  const { data, isLoading, refetch } = useReadContract({
    ...contract,
    functionName: "getPlayer",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });
  const player: OnChainPlayer | null = useMemo(() => {
    if (!data) return null;
    const r = data as unknown as readonly [
      boolean, bigint, bigint, bigint, bigint, bigint, readonly bigint[], readonly bigint[]
    ];
    return {
      registered: r[0],
      totalInvested: r[1],
      lifetimeRewards: r[2],
      lastUpdate: r[3],
      pending: r[4],
      ratePerSecond: r[5],
      minerCounts: r[6],
      minerLevels: r[7],
    };
  }, [data]);
  return { player, isLoading, refetch };
}

export function usePendingRewards() {
  const { address } = useAccount();
  const { data, isLoading } = useReadContract({
    ...contract,
    functionName: "calculateRewards",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 4000 },
  });
  return { pending: (data as bigint | undefined) ?? 0n, isLoading };
}

export function useCooldown() {
  const { address } = useAccount();
  const { data: last } = useReadContract({
    ...contract,
    functionName: "lastAction",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 2000 },
  });
  const { data: cd } = useReadContract({ ...contract, functionName: "COOLDOWN" });
  return {
    lastAction: (last as bigint | undefined) ?? 0n,
    cooldown: (cd as bigint | undefined) ?? 0n,
  };
}

export const CONTRACT_DEPLOYED =
  (MINING_MANAGER_ADDRESS as string) !== "0x0000000000000000000000000000000000000000";

export type OnChainLeaderRow = {
  address: `0x${string}`;
  totalInvested: bigint;
  lifetimeRewards: bigint;
  ratePerSecond: bigint;
  minerCount: bigint;
};

/** Reads playerList[0..n] then getPlayer for each. */
export function useLeaderboard() {
  const { data: count } = useReadContract({ ...contract, functionName: "playersCount" });
  const n = Number(count ?? 0n);

  const { data: addrData } = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({
      ...contract,
      functionName: "playerList" as const,
      args: [BigInt(i)] as const,
    })),
    query: { enabled: n > 0 },
  });

  const addresses = useMemo(
    () =>
      (addrData ?? [])
        .map((d) => d.result as `0x${string}` | undefined)
        .filter((a): a is `0x${string}` => !!a),
    [addrData],
  );

  const { data: playerData, isLoading } = useReadContracts({
    contracts: addresses.map((a) => ({
      ...contract,
      functionName: "getPlayer" as const,
      args: [a] as const,
    })),
    query: { enabled: addresses.length > 0 },
  });

  const rows: OnChainLeaderRow[] = useMemo(() => {
    if (!playerData) return [];
    return playerData.map((d, i) => {
      const r = (d.result ?? []) as unknown as readonly [
        boolean, bigint, bigint, bigint, bigint, bigint, readonly bigint[], readonly bigint[]
      ];
      const counts = (r?.[6] ?? []) as readonly bigint[];
      const totalMiners = counts.reduce((a, b) => a + b, 0n);
      return {
        address: addresses[i],
        totalInvested: r?.[1] ?? 0n,
        lifetimeRewards: r?.[2] ?? 0n,
        ratePerSecond: r?.[5] ?? 0n,
        minerCount: totalMiners,
      };
    });
  }, [playerData, addresses]);

  return { rows, isLoading, playersCount: n };
}


