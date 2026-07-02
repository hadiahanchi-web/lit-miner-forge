import { useAccount, useReadContract, useReadContracts, useBlockNumber } from "wagmi";
import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CORE_ABI,
  CORE_ADDRESS,
  ORACLE_ABI,
  ORACLE_ADDRESS,
  RISK_ABI,
  RISK_ADDRESS,
  TOKEN_ABI,
  TOKEN_ADDRESS,
  TREASURY_ABI,
  TREASURY_ADDRESS,
} from "./contract";

const core = { address: CORE_ADDRESS, abi: CORE_ABI } as const;
const treasury = { address: TREASURY_ADDRESS, abi: TREASURY_ABI } as const;
const oracle = { address: ORACLE_ADDRESS, abi: ORACLE_ABI } as const;
const token = { address: TOKEN_ADDRESS, abi: TOKEN_ABI } as const;
const riskC = { address: RISK_ADDRESS, abi: RISK_ABI } as const;

const ZERO = "0x0000000000000000000000000000000000000000";
export const CONTRACT_DEPLOYED = (CORE_ADDRESS as string).toLowerCase() !== ZERO;

/** True when the connected wallet is the Core owner. */
export function useIsAdmin() {
  const { address } = useAccount();
  const { data, isLoading } = useReadContract({
    ...core,
    functionName: "owner",
    query: { enabled: !!address && CONTRACT_DEPLOYED, refetchInterval: 8000 },
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

/** Aggregated pool + emission + config info across Core / Vault / Oracle. */
export function usePoolInfo() {
  const { data, isLoading } = useReadContracts({
    contracts: [
      { ...treasury, functionName: "rewardPool" },        // 0
      { ...treasury, functionName: "reservePool" },       // 1
      { ...treasury, functionName: "devPool" },           // 2
      { ...treasury, functionName: "availableRewards" },  // 3
      { ...treasury, functionName: "reserveBps" },        // 4
      { ...treasury, functionName: "devBps" },            // 5
      { ...core, functionName: "miningPaused" },          // 6
      { ...core, functionName: "withdrawPaused" },        // 7
      { ...core, functionName: "WITHDRAW_THRESHOLD" },    // 8
      { ...core, functionName: "MAINTENANCE_BPS" },       // 9
      { ...core, functionName: "MAX_PLAYER_SHARE_BPS" },  // 10
      { ...oracle, functionName: "getEmission" },         // 11
      { ...oracle, functionName: "base" },                // 12
      { ...oracle, functionName: "min" },                 // 13
      { ...oracle, functionName: "capTVL" },              // 14
      { ...oracle, functionName: "tvl" },                 // 15
      { ...oracle, functionName: "activeUsers" },         // 16
    ],
    query: { enabled: CONTRACT_DEPLOYED },
  });

  const rewardPool = (data?.[0]?.result as bigint | undefined) ?? 0n;
  const reservePool = (data?.[1]?.result as bigint | undefined) ?? 0n;
  const devPool = (data?.[2]?.result as bigint | undefined) ?? 0n;
  const availablePool = (data?.[3]?.result as bigint | undefined) ?? 0n;
  const emissionBps = (data?.[11]?.result as bigint | undefined) ?? 10000n;
  const emissionMax = (data?.[12]?.result as bigint | undefined) ?? 10000n;
  const emissionMin = (data?.[13]?.result as bigint | undefined) ?? 300n;

  return {
    isLoading,
    rewardPool,
    reservePool,
    reservedPool: reservePool, // alias for existing UI
    devPool,
    treasury: devPool,         // alias — old "treasury" number is now devPool
    availablePool,
    poolReserveBps: (data?.[4]?.result as bigint | undefined) ?? 1000n,
    devBps: (data?.[5]?.result as bigint | undefined) ?? 1000n,
    miningPaused: (data?.[6]?.result as boolean | undefined) ?? false,
    withdrawPaused: (data?.[7]?.result as boolean | undefined) ?? false,
    withdrawThreshold: (data?.[8]?.result as bigint | undefined) ?? 0n,
    maintenanceBps: (data?.[9]?.result as bigint | undefined) ?? 0n,
    maxPlayerShareBps: (data?.[10]?.result as bigint | undefined) ?? 1500n,
    emissionBps,
    emissionMax,
    emissionMin,
    tvlCap: (data?.[14]?.result as bigint | undefined) ?? 0n,
    tvlNow: (data?.[15]?.result as bigint | undefined) ?? 0n,
    activeUsers: (data?.[16]?.result as bigint | undefined) ?? 0n,
    emissionX: emissionMax > 0n ? Number(emissionBps) / Number(emissionMax) : 1,
    isLowEmission: emissionBps * 2n < emissionMax,
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
    ...core,
    functionName: "minersCount",
    query: { enabled: CONTRACT_DEPLOYED },
  });
  const n = Number(count ?? 0n);
  const { data, isLoading } = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({
      ...core,
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
    ...core,
    functionName: "getPlayer",
    args: address ? [address] : undefined,
    query: { enabled: !!address && CONTRACT_DEPLOYED },
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
    ...core,
    functionName: "calculateRewards",
    args: address ? [address] : undefined,
    query: { enabled: !!address && CONTRACT_DEPLOYED, refetchInterval: 4000 },
  });
  return { pending: (data as bigint | undefined) ?? 0n, isLoading };
}

export function useCooldown() {
  const { address } = useAccount();
  const { data: last } = useReadContract({
    ...core,
    functionName: "lastAction",
    args: address ? [address] : undefined,
    query: { enabled: !!address && CONTRACT_DEPLOYED, refetchInterval: 2000 },
  });
  const { data: cd } = useReadContract({
    ...core,
    functionName: "COOLDOWN",
    query: { enabled: CONTRACT_DEPLOYED },
  });
  return {
    lastAction: (last as bigint | undefined) ?? 0n,
    cooldown: (cd as bigint | undefined) ?? 0n,
  };
}

export function useWhaleShare() {
  const { address } = useAccount();
  const { player } = usePlayer();
  const { data: totalPower } = useReadContract({
    ...core,
    functionName: "totalPower",
    query: { enabled: !!address && CONTRACT_DEPLOYED, refetchInterval: 6000 },
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

/** Connected wallet's LFR balance + total supply. */
export function useLfrBalance() {
  const { address } = useAccount();
  const { data } = useReadContracts({
    contracts: [
      {
        ...token,
        functionName: "balanceOf" as const,
        args: address ? ([address] as const) : ([ZERO as `0x${string}`] as const),
      },
      { ...token, functionName: "totalSupply" as const },
      { ...token, functionName: "symbol" as const },
    ],
    query: { enabled: !!address && CONTRACT_DEPLOYED },
  });
  return {
    balance: (data?.[0]?.result as bigint | undefined) ?? 0n,
    totalSupply: (data?.[1]?.result as bigint | undefined) ?? 0n,
    symbol: (data?.[2]?.result as string | undefined) ?? "LFR",
  };
}

/** Connected wallet's risk score + hard-block state. */
export function useRiskScore() {
  const { address } = useAccount();
  const { data } = useReadContracts({
    contracts: [
      {
        ...riskC,
        functionName: "score" as const,
        args: address ? ([address] as const) : ([ZERO as `0x${string}`] as const),
      },
      { ...riskC, functionName: "maxScore" as const },
      {
        ...riskC,
        functionName: "isBlocked" as const,
        args: address ? ([address] as const) : ([ZERO as `0x${string}`] as const),
      },
    ],
    query: { enabled: !!address && CONTRACT_DEPLOYED, refetchInterval: 6000 },
  });
  const score = (data?.[0]?.result as bigint | undefined) ?? 0n;
  const maxScore = (data?.[1]?.result as bigint | undefined) ?? 100n;
  const blocked = (data?.[2]?.result as boolean | undefined) ?? false;
  return { score, maxScore, blocked };
}

export type OnChainLeaderRow = {
  address: `0x${string}`;
  totalInvested: bigint;
  lifetimeRewards: bigint;
  ratePerSecond: bigint;
  minerCount: bigint;
};

export function useLeaderboard() {
  const { data: count } = useReadContract({
    ...core,
    functionName: "playersCount",
    query: { enabled: CONTRACT_DEPLOYED },
  });
  const n = Number(count ?? 0n);

  const { data: addrData } = useReadContracts({
    contracts: Array.from({ length: n }, (_, i) => ({
      ...core,
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
      ...core,
      functionName: "getPlayer" as const,
      args: [a] as const,
    })),
    query: { enabled: addresses.length > 0 },
  });

  // Read LFR balance for each player (columns display in LFR).
  const { data: lfrData } = useReadContracts({
    contracts: addresses.map((a) => ({
      ...token,
      functionName: "balanceOf" as const,
      args: [a] as const,
    })),
    query: { enabled: addresses.length > 0 && CONTRACT_DEPLOYED },
  });

  const rows: (OnChainLeaderRow & { lfrBalance: bigint })[] = useMemo(() => {
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
        lfrBalance: (lfrData?.[i]?.result as bigint | undefined) ?? 0n,
      };
    });
  }, [playerData, addresses, lfrData]);

  return { rows, isLoading, playersCount: n };
}
