import { useAccount, useReadContract, useReadContracts, useBlockNumber } from "wagmi";
import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { MINING_MANAGER_ABI, MINING_MANAGER_ADDRESS } from "./contract";

const contract = { address: MINING_MANAGER_ADDRESS, abi: MINING_MANAGER_ABI } as const;

/** True when the connected wallet is the contract owner. (v6 has no admin role.) */
export function useIsAdmin() {
  const { address } = useAccount();
  const { data, isLoading } = useReadContract({
    ...contract,
    functionName: "owner",
    query: { enabled: !!address, refetchInterval: 8000 },
  });
  const owner = (data as `0x${string}` | undefined) ?? undefined;
  const isOwner = !!address && !!owner && address.toLowerCase() === owner.toLowerCase();
  return { isAdmin: isOwner, isOwner, owner, isLoading };
}

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
      { ...contract, functionName: "MAINTENANCE_BPS" },
      { ...contract, functionName: "getEmissionBps" },
      { ...contract, functionName: "getAvailablePool" },
      { ...contract, functionName: "getReservedPool" },
      { ...contract, functionName: "MIN_POOL_RESERVE_BPS" },
      { ...contract, functionName: "MAX_PLAYER_SHARE_BPS" },
      { ...contract, functionName: "EMISSION_MAX_BPS" },
      { ...contract, functionName: "EMISSION_MIN_BPS" },
      { ...contract, functionName: "TVL_CAP" },
    ],
  });
  const emissionBps = (data?.[6]?.result as bigint | undefined) ?? 10000n;
  const emissionMax = (data?.[11]?.result as bigint | undefined) ?? 10000n;
  const emissionMin = (data?.[12]?.result as bigint | undefined) ?? 500n;
  return {
    isLoading,
    rewardPool: (data?.[0]?.result as bigint | undefined) ?? 0n,
    treasury: (data?.[1]?.result as bigint | undefined) ?? 0n,
    miningPaused: (data?.[2]?.result as boolean | undefined) ?? false,
    withdrawPaused: (data?.[3]?.result as boolean | undefined) ?? false,
    withdrawThreshold: (data?.[4]?.result as bigint | undefined) ?? 0n,
    maintenanceBps: (data?.[5]?.result as bigint | undefined) ?? 0n,
    emissionBps,
    availablePool: (data?.[7]?.result as bigint | undefined) ?? 0n,
    reservedPool: (data?.[8]?.result as bigint | undefined) ?? 0n,
    poolReserveBps: (data?.[9]?.result as bigint | undefined) ?? 1000n,
    maxPlayerShareBps: (data?.[10]?.result as bigint | undefined) ?? 1500n,
    emissionMax,
    emissionMin,
    tvlCap: (data?.[13]?.result as bigint | undefined) ?? 0n,
    // Emission "x" multiplier (relative to EMISSION_MAX = 1x)
    emissionX: emissionMax > 0n ? Number(emissionBps) / Number(emissionMax) : 1,
    isLowEmission: emissionBps * 2n < emissionMax, // < 50% of max
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
      const r = (d.result ?? []) as readonly [bigint, bigint, bigint, bigint, bigint, boolean];
      return {
        id: i,
        price: r?.[0] ?? 0n,
        basePrice: r?.[1] ?? 0n,
        ratePerSecond: r?.[2] ?? 0n,
        unlockRequiresId: r?.[3] ?? 0n,
        unlockMinInvested: r?.[4] ?? 0n,
        active: r?.[5] ?? false,
        totalMintedGlobal: 0n,
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

/** Reads global total power + player's power for anti-whale share calculation. */
export function useWhaleShare() {
  const { address } = useAccount();
  const { player } = usePlayer();
  const { data: totalPower } = useReadContract({
    ...contract,
    functionName: "totalPower",
    query: { enabled: !!address, refetchInterval: 6000 },
  });
  const { maxPlayerShareBps } = usePoolInfo();
  const total = (totalPower as bigint | undefined) ?? 0n;
  const my = player?.ratePerSecond ?? 0n;
  const shareBps = total > 0n ? Number((my * 10000n) / total) : 0;
  const limitBps = Number(maxPlayerShareBps);
  return {
    shareBps,
    limitBps,
    isWhaleBlocked: total > 0n && shareBps > limitBps,
    isWhaleWarn: total > 0n && shareBps > limitBps * 0.8,
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
