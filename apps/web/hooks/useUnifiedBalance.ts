'use client';

import { useReadContract, useAccount } from 'wagmi';
import { useQuery } from '@tanstack/react-query';
import { useCircleSDK } from '../app/providers';
import { USDC_ADDRESS } from '../lib/contracts';

/** Minimal ERC-20 ABI for balanceOf */
const erc20BalanceOfAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

export interface UseUnifiedBalanceResult {
  /** Total USDC balance aggregated across Arc Network and Arbitrum (via CCTP pre-credit) */
  unifiedBalance: bigint;
  /** USDC balance on Arc Network */
  arcBalance: bigint;
  /** Pre-credited balance from CCTP (Arbitrum → Arc) */
  preCreditedBalance: bigint;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Hook that aggregates USDC balances across Arc Network and Arbitrum.
 * - Reads the user's USDC balance on Arc Network via ERC-20 balanceOf
 * - Reads pre-credited balance from CCTP module (via Circle SDK)
 * - Combines into a unified balance view
 */
export function useUnifiedBalance(): UseUnifiedBalanceResult {
  const { address, isConnected } = useAccount();
  const { cctp } = useCircleSDK();

  // USDC balance on Arc Network (ERC-20 balanceOf)
  const {
    data: arcBalanceData,
    isLoading: isArcLoading,
    isError: isArcError,
    refetch: refetchArc,
  } = useReadContract({
    address: USDC_ADDRESS,
    abi: erc20BalanceOfAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 15_000,
    },
  });

  // Pre-credited balance from CCTP Gateway
  const {
    data: preCreditedData,
    isLoading: isCctpLoading,
    isError: isCctpError,
    refetch: refetchCctp,
  } = useQuery({
    queryKey: ['preCreditedBalance', address],
    queryFn: async () => {
      if (!address) return 0n;
      try {
        return await cctp.getPreCreditedBalance(address);
      } catch {
        return 0n;
      }
    },
    enabled: isConnected && !!address,
    refetchInterval: 15_000,
  });

  const arcBalance = (arcBalanceData as bigint) ?? 0n;
  const preCreditedBalance = preCreditedData ?? 0n;
  const unifiedBalance = arcBalance + preCreditedBalance;

  const isLoading = isArcLoading || isCctpLoading;
  const isError = isArcError && isCctpError; // Only error if both fail

  const refetch = () => {
    refetchArc();
    refetchCctp();
  };

  return {
    unifiedBalance,
    arcBalance,
    preCreditedBalance,
    isLoading,
    isError,
    refetch,
  };
}
