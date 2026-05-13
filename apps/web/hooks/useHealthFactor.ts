'use client';

import { useReadContract } from 'wagmi';
import { useAccount } from 'wagmi';
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
  const { address, isConnected } = useAccount();

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

  const healthFactor: number | null =
    data != null ? Number((data as bigint) * 10000n / RAY) / 10000 : null;

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
