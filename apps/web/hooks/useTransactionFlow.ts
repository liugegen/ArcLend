'use client';

import { useCallback, useRef, useState } from 'react';

import type {
  GasFeeEstimate,
  UserOperation,
  SignedUserOperation,
} from '@arclend/circle-sdk';
import { PaymasterUnavailableError } from '@arclend/circle-sdk';

import { useCircleSDK } from '../app/providers';
import { useWallet } from '../contexts/WalletContext';
import { embeddedWalletModule } from '../lib/circleClient';

// ─── Types ──────────────────────────────────────────────────────────────────

export type TransactionFlowStatus =
  | 'idle'
  | 'estimating'
  | 'confirming'
  | 'signing'
  | 'submitting'
  | 'pending'
  | 'confirmed'
  | 'failed';

export interface TransactionFlowError {
  message: string;
  code: 'PAYMASTER_UNAVAILABLE' | 'INSUFFICIENT_FEE' | 'SIGNING_FAILED' | 'SUBMISSION_FAILED' | 'UNKNOWN';
}

export interface UseTransactionFlowResult {
  status: TransactionFlowStatus;
  feeEstimate: GasFeeEstimate | null;
  error: TransactionFlowError | null;
  paymasterUnavailable: boolean;
  estimateFee: (callData: `0x${string}`) => Promise<void>;
  execute: () => Promise<void>;
  reset: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 2_000;
const MAX_POLL_ATTEMPTS = 30; // 60 seconds max polling

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Hook managing the full gasless transaction lifecycle:
 * idle → estimating → confirming → signing → submitting → pending → confirmed/failed
 *
 * Uses Circle Paymaster for fee estimation and gas sponsorship,
 * and Circle Embedded Wallet for UserOperation signing.
 */
export function useTransactionFlow(): UseTransactionFlowResult {
  const { paymaster } = useCircleSDK();
  const embeddedWallet = embeddedWalletModule;
  const { session } = useWallet();

  const [status, setStatus] = useState<TransactionFlowStatus>('idle');
  const [feeEstimate, setFeeEstimate] = useState<GasFeeEstimate | null>(null);
  const [error, setError] = useState<TransactionFlowError | null>(null);
  const [paymasterUnavailable, setPaymasterUnavailable] = useState(false);

  // Store the current UserOp and callData for the execute step
  const userOpRef = useRef<UserOperation | null>(null);
  const callDataRef = useRef<`0x${string}` | null>(null);

  /**
   * Build a minimal UserOperation from callData for estimation.
   */
  const buildUserOp = useCallback(
    (callData: `0x${string}`): UserOperation => {
      const sender = (session?.walletAddress ?? '0x0000000000000000000000000000000000000000') as `0x${string}`;
      return {
        sender,
        nonce: 0n,
        initCode: '0x' as `0x${string}`,
        callData,
        callGasLimit: 0n,
        verificationGasLimit: 0n,
        preVerificationGas: 0n,
        maxFeePerGas: 0n,
        maxPriorityFeePerGas: 0n,
        paymasterAndData: '0x' as `0x${string}`,
      };
    },
    [session],
  );

  /**
   * Estimate the gas fee for a transaction.
   * Transitions: idle → estimating → confirming (or failed)
   */
  const estimateFee = useCallback(
    async (callData: `0x${string}`) => {
      setStatus('estimating');
      setError(null);
      setPaymasterUnavailable(false);
      callDataRef.current = callData;

      try {
        const userOp = buildUserOp(callData);
        const estimate = await paymaster.estimateGasFee(userOp);

        userOpRef.current = userOp;
        setFeeEstimate(estimate);
        setStatus('confirming');
      } catch (err) {
        if (err instanceof PaymasterUnavailableError) {
          setPaymasterUnavailable(true);
          setError({
            message: 'Paymaster service is unavailable. You can pay gas in ARC token directly.',
            code: 'PAYMASTER_UNAVAILABLE',
          });
        } else {
          setError({
            message: err instanceof Error ? err.message : 'Failed to estimate gas fee',
            code: 'UNKNOWN',
          });
        }
        setStatus('failed');
      }
    },
    [buildUserOp, paymaster],
  );

  /**
   * Execute the transaction after user confirmation.
   * Transitions: confirming → signing → submitting → pending → confirmed/failed
   */
  const execute = useCallback(async () => {
    if (!session || !userOpRef.current) {
      setError({ message: 'No wallet session or transaction prepared', code: 'UNKNOWN' });
      setStatus('failed');
      return;
    }

    // ─── Signing ──────────────────────────────────────────────────────────
    setStatus('signing');
    setError(null);

    let signedOp: SignedUserOperation;
    try {
      // Get paymaster data and inject into UserOp before signing
      const paymasterData = await paymaster.getPaymasterData(userOpRef.current);
      const userOpWithPaymaster: UserOperation = {
        ...userOpRef.current,
        paymasterAndData: paymasterData.paymasterData,
      };

      signedOp = await embeddedWallet.signUserOperation(
        {
          userId: session.userToken,
          walletAddress: session.walletAddress as `0x${string}`,
          chainId: 5042002,
          expiresAt: Date.now() + 3600_000,
        },
        userOpWithPaymaster,
      );
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : 'Failed to sign transaction',
        code: 'SIGNING_FAILED',
      });
      setStatus('failed');
      return;
    }

    // ─── Submission ───────────────────────────────────────────────────────
    setStatus('submitting');

    let txHash: string;
    try {
      // Submit the signed UserOp to the bundler
      const response = await fetch('/api/bundler/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signedUserOperation: {
            sender: signedOp.sender,
            nonce: signedOp.nonce.toString(),
            initCode: signedOp.initCode,
            callData: signedOp.callData,
            callGasLimit: signedOp.callGasLimit.toString(),
            verificationGasLimit: signedOp.verificationGasLimit.toString(),
            preVerificationGas: signedOp.preVerificationGas.toString(),
            maxFeePerGas: signedOp.maxFeePerGas.toString(),
            maxPriorityFeePerGas: signedOp.maxPriorityFeePerGas.toString(),
            paymasterAndData: signedOp.paymasterAndData,
            signature: signedOp.signature,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Bundler returned HTTP ${response.status}`);
      }

      const result = (await response.json()) as { txHash: string };
      txHash = result.txHash;
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : 'Failed to submit transaction',
        code: 'SUBMISSION_FAILED',
      });
      setStatus('failed');
      return;
    }

    // ─── Status Polling ───────────────────────────────────────────────────
    setStatus('pending');

    try {
      let attempts = 0;
      while (attempts < MAX_POLL_ATTEMPTS) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        attempts++;

        const statusResponse = await fetch(`/api/bundler/status?txHash=${txHash}`);
        if (!statusResponse.ok) continue;

        const statusResult = (await statusResponse.json()) as { status: string };

        if (statusResult.status === 'confirmed') {
          setStatus('confirmed');
          return;
        }

        if (statusResult.status === 'failed') {
          setError({ message: 'Transaction failed on-chain', code: 'SUBMISSION_FAILED' });
          setStatus('failed');
          return;
        }
      }

      // Timeout — treat as pending (user can check later)
      setError({ message: 'Transaction confirmation timed out. It may still confirm.', code: 'UNKNOWN' });
      setStatus('failed');
    } catch {
      setError({ message: 'Failed to poll transaction status', code: 'UNKNOWN' });
      setStatus('failed');
    }
  }, [session, paymaster, embeddedWallet]);

  /**
   * Reset the flow back to idle state.
   */
  const reset = useCallback(() => {
    setStatus('idle');
    setFeeEstimate(null);
    setError(null);
    setPaymasterUnavailable(false);
    userOpRef.current = null;
    callDataRef.current = null;
  }, []);

  return {
    status,
    feeEstimate,
    error,
    paymasterUnavailable,
    estimateFee,
    execute,
    reset,
  };
}
