'use client';

import { useReadContracts } from 'wagmi';
import { useAccount } from 'wagmi';
import {
  arcLendVaultAbi,
  ARCLEND_VAULT_ADDRESS,
  USDC_ADDRESS,
  EURC_ADDRESS,
} from '../lib/contracts';

export interface UserPositionData {
  supplyShares: bigint;
  collateralBalance: bigint;
  borrowPrincipal: bigint;
  borrowIndex: bigint;
}

export interface PoolStateData {
  totalShares: bigint;
  totalDeposits: bigint;
  totalBorrows: bigint;
  totalReserves: bigint;
  lastAccrualBlock: bigint;
  borrowIndex: bigint;
  depositsPaused: boolean;
  withdrawalsPaused: boolean;
  borrowsPaused: boolean;
  repaymentsPaused: boolean;
}

export interface UseUserPositionResult {
  position: UserPositionData | null;
  usdcPoolState: PoolStateData | null;
  eurcPoolState: PoolStateData | null;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * React Query hook that reads on-chain getUserPosition and getPoolState
 * for the connected user. Refetches every 15 seconds.
 */
export function useUserPosition(): UseUserPositionResult {
  const { address, isConnected } = useAccount();

  const { data, isLoading, isError, refetch } = useReadContracts({
    contracts: [
      {
        address: ARCLEND_VAULT_ADDRESS,
        abi: arcLendVaultAbi,
        functionName: 'getUserPosition',
        args: address ? [address] : undefined,
      },
      {
        address: ARCLEND_VAULT_ADDRESS,
        abi: arcLendVaultAbi,
        functionName: 'getPoolState',
        args: [USDC_ADDRESS],
      },
      {
        address: ARCLEND_VAULT_ADDRESS,
        abi: arcLendVaultAbi,
        functionName: 'getPoolState',
        args: [EURC_ADDRESS],
      },
    ],
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 15_000,
    },
  });

  const position: UserPositionData | null =
    data?.[0]?.status === 'success' && data[0].result
      ? {
          supplyShares: (data[0].result as UserPositionData).supplyShares,
          collateralBalance: (data[0].result as UserPositionData).collateralBalance,
          borrowPrincipal: (data[0].result as UserPositionData).borrowPrincipal,
          borrowIndex: (data[0].result as UserPositionData).borrowIndex,
        }
      : null;

  const usdcPoolState: PoolStateData | null =
    data?.[1]?.status === 'success' && data[1].result
      ? (data[1].result as unknown as PoolStateData)
      : null;

  const eurcPoolState: PoolStateData | null =
    data?.[2]?.status === 'success' && data[2].result
      ? (data[2].result as unknown as PoolStateData)
      : null;

  return {
    position,
    usdcPoolState,
    eurcPoolState,
    isLoading,
    isError,
    refetch,
  };
}
