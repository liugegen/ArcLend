'use client';

/**
 * useTransactionFlow — Circle User Controlled Wallets transaction execution.
 *
 * Architecture:
 * 1. Client encodes callData (e.g., deposit, approve)
 * 2. Server creates a contract execution challenge via Circle API
 * 3. Client SDK executes the challenge (user signs with embedded wallet)
 * 4. Circle submits the transaction to Arc Network
 * 5. Client polls for transaction confirmation
 *
 * Paymaster Integration (optional, future):
 * When Circle Paymaster becomes available on Arc Testnet, the flow will
 * attempt sponsored gas first. If unavailable, it falls through to the
 * standard contract execution path (gas paid from wallet balance).
 *
 * This ensures transactions ALWAYS proceed regardless of paymaster status.
 */

import { useCallback, useRef, useState } from 'react';

import type { GasFeeEstimate } from '@arclend/circle-sdk';

import { useWallet } from '../contexts/WalletContext';
import { useBalanceRefresh } from './useBalanceRefresh';
import { ARCLEND_VAULT_ADDRESS } from '../lib/contracts';

// ─── Types ──────────────────────────────────────────────────────────────────

export type TransactionFlowStatus =
  | 'idle'
  | 'preparing'
  | 'estimating'
  | 'confirming'
  | 'signing'
  | 'submitting'
  | 'pending'
  | 'confirmed'
  | 'failed';

export interface TransactionFlowError {
  message: string;
  code:
    | 'NO_SESSION'
    | 'CHALLENGE_FAILED'
    | 'SIGNING_FAILED'
    | 'SUBMISSION_FAILED'
    | 'TIMEOUT'
    | 'UNKNOWN';
}

export interface UseTransactionFlowResult {
  status: TransactionFlowStatus;
  feeEstimate: GasFeeEstimate | null;
  error: TransactionFlowError | null;
  /** Whether Circle Paymaster sponsorship is active (future) */
  gasSponsored: boolean;
  /** @deprecated Use prepareTransaction instead */
  paymasterUnavailable: boolean;
  /** Prepare a transaction for execution */
  prepareTransaction: (contractAddress: `0x${string}`, callData: `0x${string}`) => void;
  /**
   * @deprecated Backward-compatible alias. Calls prepareTransaction with ARCLEND_VAULT_ADDRESS.
   * Used by borrow/withdraw/repay pages that haven't been migrated yet.
   */
  estimateFee: (callData: `0x${string}`) => Promise<void>;
  /** Execute the prepared transaction */
  execute: () => Promise<void>;
  /** Reset the flow back to idle */
  reset: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 3_000;
const MAX_POLL_ATTEMPTS = 40; // 120 seconds max polling

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Hook managing the transaction lifecycle via Circle User Controlled Wallets:
 * idle → preparing → confirming → signing → submitting → pending → confirmed/failed
 */
export function useTransactionFlow(): UseTransactionFlowResult {
  const { session, executeChallenge } = useWallet();
  const { refreshAll } = useBalanceRefresh();

  const [status, setStatus] = useState<TransactionFlowStatus>('idle');
  const [feeEstimate, setFeeEstimate] = useState<GasFeeEstimate | null>(null);
  const [error, setError] = useState<TransactionFlowError | null>(null);
  const [gasSponsored] = useState(false); // Future: set true when paymaster is live

  // Store transaction params for the execute step
  const contractAddressRef = useRef<`0x${string}` | null>(null);
  const callDataRef = useRef<`0x${string}` | null>(null);
  const challengeIdRef = useRef<string | null>(null);

  /**
   * Helper: Call the Circle backend API route.
   */
  const callCircleApi = useCallback(
    async (action: string, params: Record<string, unknown> = {}) => {
      const response = await fetch('/api/circle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params }),
      });

      const data = await response.json();

      if (!response.ok) {
        const msg = data?.message || data?.error || `API error (${response.status})`;
        throw new Error(msg);
      }

      return data;
    },
    [],
  );

  /**
   * Prepare a transaction for execution.
   * Stores the contract address and callData, transitions to confirming state.
   * No external API calls here — just prepares the UI for user confirmation.
   */
  const prepareTransaction = useCallback(
    (contractAddress: `0x${string}`, callData: `0x${string}`) => {
      if (!session) {
        setError({ message: 'No wallet session. Please log in.', code: 'NO_SESSION' });
        setStatus('failed');
        return;
      }

      contractAddressRef.current = contractAddress;
      callDataRef.current = callData;
      setError(null);
      setFeeEstimate(null);
      setStatus('confirming');
    },
    [session],
  );

  /**
   * Execute the prepared transaction via Circle User Controlled Wallets.
   *
   * Flow:
   * 1. Create contract execution challenge (server-side)
   * 2. Execute challenge via Circle SDK (client-side signing)
   * 3. Poll for transaction confirmation
   */
  const execute = useCallback(async () => {
    if (!session) {
      setError({ message: 'No wallet session. Please log in.', code: 'NO_SESSION' });
      setStatus('failed');
      return;
    }

    if (!contractAddressRef.current || !callDataRef.current) {
      setError({ message: 'No transaction prepared.', code: 'UNKNOWN' });
      setStatus('failed');
      return;
    }

    // ─── Step 1: Create contract execution challenge ────────────────────
    setStatus('signing');
    setError(null);

    let challengeId: string;
    try {
      const result = await callCircleApi('createContractExecution', {
        userToken: session.userToken,
        walletId: session.walletId,
        contractAddress: contractAddressRef.current,
        callData: callDataRef.current,
      });

      challengeId = result.challengeId;
      if (!challengeId) {
        throw new Error('No challengeId returned from contract execution request');
      }
      challengeIdRef.current = challengeId;
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : 'Failed to create transaction',
        code: 'CHALLENGE_FAILED',
      });
      setStatus('failed');
      return;
    }

    // ─── Step 2: Execute challenge via Circle SDK ───────────────────────
    setStatus('submitting');

    try {
      await executeChallenge(challengeId);
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : 'Transaction signing failed',
        code: 'SIGNING_FAILED',
      });
      setStatus('failed');
      return;
    }

    // ─── Step 3: Poll for transaction confirmation ──────────────────────
    setStatus('pending');

    try {
      let attempts = 0;
      while (attempts < MAX_POLL_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        attempts++;

        try {
          const txData = await callCircleApi('getTransaction', {
            userToken: session.userToken,
            transactionId: challengeIdRef.current,
          });

          const txState = txData?.transaction?.state ?? txData?.state;

          if (txState === 'CONFIRMED' || txState === 'COMPLETE') {
            setStatus('confirmed');
            refreshAll();
            return;
          }

          if (txState === 'FAILED' || txState === 'CANCELLED') {
            setError({
              message: `Transaction ${txState.toLowerCase()} on-chain`,
              code: 'SUBMISSION_FAILED',
            });
            setStatus('failed');
            return;
          }

          // Still pending — continue polling
        } catch {
          // Polling error — continue trying
        }
      }

      // Timeout — transaction may still confirm
      setError({
        message: 'Transaction is still processing. Check your portfolio for updates.',
        code: 'TIMEOUT',
      });
      setStatus('failed');
    } catch {
      setError({
        message: 'Failed to check transaction status',
        code: 'UNKNOWN',
      });
      setStatus('failed');
    }
  }, [session, callCircleApi, executeChallenge, refreshAll]);

  /**
   * Reset the flow back to idle state.
   */
  const reset = useCallback(() => {
    setStatus('idle');
    setFeeEstimate(null);
    setError(null);
    contractAddressRef.current = null;
    callDataRef.current = null;
    challengeIdRef.current = null;
  }, []);

  /**
   * Backward-compatible wrapper for pages that still use the old estimateFee API.
   * Maps to prepareTransaction with ARCLEND_VAULT_ADDRESS as the default target.
   */
  const estimateFee = useCallback(
    async (callData: `0x${string}`) => {
      prepareTransaction(ARCLEND_VAULT_ADDRESS as `0x${string}`, callData);
    },
    [prepareTransaction],
  );

  return {
    status,
    feeEstimate,
    error,
    gasSponsored,
    paymasterUnavailable: false, // Paymaster is no longer a hard dependency
    prepareTransaction,
    estimateFee,
    execute,
    reset,
  };
}
