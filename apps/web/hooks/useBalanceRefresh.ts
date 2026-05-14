'use client';

/**
 * useBalanceRefresh — Centralized balance refresh after transactions.
 *
 * Provides a `refreshAll` function that invalidates all balance-related
 * React Query caches, triggering immediate refetch of:
 * - USDC/EURC balances (via wagmi useReadContract)
 * - User positions (supply shares, borrow principal)
 * - Health factor
 * - Unified balance (Arc + CCTP pre-credited)
 * - Market data (pool state, APYs)
 *
 * Call `refreshAll()` after any successful transaction (supply, borrow,
 * repay, withdraw, bridge) to ensure the UI reflects the latest state.
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export interface UseBalanceRefreshResult {
  /** Invalidate all balance and position caches, triggering immediate refetch */
  refreshAll: () => void;
}

/**
 * Hook that provides a function to invalidate all protocol-related query caches.
 * This forces React Query to refetch all balance, position, and market data.
 */
export function useBalanceRefresh(): UseBalanceRefreshResult {
  const queryClient = useQueryClient();

  const refreshAll = useCallback(() => {
    // Invalidate all wagmi contract read queries
    // wagmi uses query keys prefixed with the contract address and function name
    queryClient.invalidateQueries({ queryKey: ['readContract'] });
    queryClient.invalidateQueries({ queryKey: ['readContracts'] });

    // Invalidate CCTP pre-credited balance
    queryClient.invalidateQueries({ queryKey: ['preCreditedBalance'] });

    // Invalidate any other custom queries
    queryClient.invalidateQueries({ queryKey: ['balance'] });
  }, [queryClient]);

  return { refreshAll };
}
