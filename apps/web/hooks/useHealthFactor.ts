'use client';

import { useReadContract } from 'wagmi';
import { useWalletAccount } from './useWalletAccount';
import { arcLendVaultAbi, ARCLEND_VAULT_ADDRESS } from '../lib/contracts';

/** RAY = 1e27, used for on-chain precision */
const RAY = BigInt('1000000000000000000000000000');

export interface UseHealthFactorResult {
  /** Health factor as a decimal number (e.g., 1.5 means 150% collateralization) */
  healthFactor: number | null;
  /** True when HF <= 1.2 — user should be warned about liquidation risk */
  isWarning: boolean;
  /** True when HF < 1.0 — position is liquidatable */
  isLiquidatable: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Hook that reads the on-chain getHealthFactor for the connected user.
 * Converts from ray (1e27) to a decimal number.
 * Returns warning state when HF <= 1.2 and liquidatable state when HF < 1.0.
 * Refetches every 15 seconds.
 */
export function useHealthFactor(): UseHealthFactorResult {
  const { address, isConnected } = useWalletAccount();

  const { data, isLoading, isError, refetch } = useReadContract({
    address: ARCLEND_VAULT_ADDRESS,
    abi: arcLendVaultAbi,
    functionName: 'getHealthFactor',
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 15_000,
    },
  });

  // When there are no borrows, the contract returns type(uint256).max
  // which represents infinite health. Detect this and return null (∞).
  // Any value above 1e20 in ray terms is effectively infinite.
  const MAX_MEANINGFUL_HF_RAY = BigInt('100000000000000000000') * RAY; // 1e20 * RAY

  const healthFactor: number | null =
    data != null
      ? (data as bigint) >= MAX_MEANINGFUL_HF_RAY
        ? null // Infinite — no borrows
        : Number((data as bigint) * 10000n / RAY) / 10000
      : null;

  const isWarning = healthFactor != null && healthFactor <= 1.2;
  const isLiquidatable = healthFactor != null && healthFactor < 1.0;

  return {
    healthFactor,
    isWarning,
    isLiquidatable,
    isLoading,
    isError,
    refetch,
  };
}
