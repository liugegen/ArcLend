'use client';

import { useReadContracts } from 'wagmi';
import { useWalletAccount } from './useWalletAccount';
import {
  arcLendVaultAbi,
  ARCLEND_VAULT_ADDRESS,
  USDC_ADDRESS,
  EURC_ADDRESS,
} from '../lib/contracts';

/** ABI for reading per-asset user shares */
const userSharesAbi = [
  {
    type: 'function',
    name: 'userShares',
    inputs: [
      { name: '', type: 'address' },
      { name: '', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

export interface UserPositionData {
  /** USDC supply shares */
  usdcShares: bigint;
  /** EURC supply shares */
  eurcShares: bigint;
  /** Total collateral value (sum of all supplied, 6 decimals) */
  collateralBalance: bigint;
  /** Borrow principal for primary asset */
  borrowPrincipal: bigint;
  /** Borrow index for primary asset */
  borrowIndex: bigint;
  /** Legacy field — USDC shares (for backward compat) */
  supplyShares: bigint;
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
 * Reads on-chain user position data including per-asset shares.
 * Fetches: getUserPosition, getPoolState(USDC), getPoolState(EURC),
 *          userShares(user, USDC), userShares(user, EURC)
 */
export function useUserPosition(): UseUserPositionResult {
  const { address, isConnected } = useWalletAccount();

  const { data, isLoading, isError, refetch } = useReadContracts({
    contracts: [
      // [0] getUserPosition — returns primary asset data + total collateral value
      {
        address: ARCLEND_VAULT_ADDRESS,
        abi: arcLendVaultAbi,
        functionName: 'getUserPosition',
        args: address ? [address] : undefined,
      },
      // [1] USDC pool state
      {
        address: ARCLEND_VAULT_ADDRESS,
        abi: arcLendVaultAbi,
        functionName: 'getPoolState',
        args: [USDC_ADDRESS],
      },
      // [2] EURC pool state
      {
        address: ARCLEND_VAULT_ADDRESS,
        abi: arcLendVaultAbi,
        functionName: 'getPoolState',
        args: [EURC_ADDRESS],
      },
      // [3] User USDC shares (direct mapping read)
      {
        address: ARCLEND_VAULT_ADDRESS,
        abi: userSharesAbi,
        functionName: 'userShares',
        args: address ? [address, USDC_ADDRESS] : undefined,
      },
      // [4] User EURC shares (direct mapping read)
      {
        address: ARCLEND_VAULT_ADDRESS,
        abi: userSharesAbi,
        functionName: 'userShares',
        args: address ? [address, EURC_ADDRESS] : undefined,
      },
    ],
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 15_000,
    },
  });

  // Parse getUserPosition result
  const positionResult = data?.[0]?.status === 'success' ? data[0].result as any : null;

  // Parse per-asset shares
  const usdcShares: bigint = data?.[3]?.status === 'success'
    ? (data[3].result as bigint) ?? 0n
    : 0n;

  const eurcShares: bigint = data?.[4]?.status === 'success'
    ? (data[4].result as bigint) ?? 0n
    : 0n;

  const position: UserPositionData | null = positionResult
    ? {
        usdcShares,
        eurcShares,
        supplyShares: usdcShares, // backward compat (legacy field)
        collateralBalance: positionResult.collateralBalance ?? 0n,
        borrowPrincipal: positionResult.borrowPrincipal ?? 0n,
        borrowIndex: positionResult.borrowIndex ?? 0n,
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
