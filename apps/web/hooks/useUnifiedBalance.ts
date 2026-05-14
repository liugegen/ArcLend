'use client';

import { useReadContract } from 'wagmi';
import { useWalletAccount } from './useWalletAccount';
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
  /** Total USDC balance on Arc Network */
  unifiedBalance: bigint;
  /** USDC balance on Arc Network (ERC-20 balanceOf) */
  arcBalance: bigint;
  /** Pre-credited balance — disabled while bridge is inactive */
  preCreditedBalance: bigint;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Hook that reads the user's USDC balance on Arc Network.
 *
 * NOTE: CCTP pre-credited balance fetching is disabled while the bridge
 * feature is inactive. The unified balance equals the Arc Network balance.
 * Re-enable CCTP balance when bridge goes live.
 */
export function useUnifiedBalance(): UseUnifiedBalanceResult {
  const { address, isConnected } = useWalletAccount();

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

  const arcBalance = (arcBalanceData as bigint) ?? 0n;
  // CCTP pre-credited balance disabled — bridge feature inactive
  const preCreditedBalance = 0n;
  const unifiedBalance = arcBalance;

  return {
    unifiedBalance,
    arcBalance,
    preCreditedBalance,
    isLoading: isArcLoading,
    isError: isArcError,
    refetch: refetchArc,
  };
}
