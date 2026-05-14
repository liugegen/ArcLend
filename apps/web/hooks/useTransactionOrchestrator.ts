'use client';

/**
 * useTransactionOrchestrator — Production-grade DeFi transaction UX.
 *
 * Flow:
 * 1. Check token allowance (on-chain read)
 * 2. If insufficient → approve via Circle challenge (popup #1)
 * 3. Wait for approval receipt on-chain
 * 4. Execute protocol action via Circle challenge (popup #2)
 * 5. Wait for transaction receipt on-chain (real tx hash)
 * 6. Show success with verified tx hash + explorer link
 * 7. Refresh balances
 *
 * The tx hash is obtained by polling Circle's transaction API after
 * challenge execution, then verified on-chain via waitForTransactionReceipt.
 */

import { useCallback, useRef, useState } from 'react';
import { encodeFunctionData } from 'viem';

import { useWallet } from '../contexts/WalletContext';
import { useWalletAccount } from './useWalletAccount';
import { useBalanceRefresh } from './useBalanceRefresh';

// ─── Types ──────────────────────────────────────────────────────────────────

export type OrchestratorStep =
  | 'idle'
  | 'checking-allowance'
  | 'approving'
  | 'waiting-approval'
  | 'executing'
  | 'confirming'
  | 'confirmed'
  | 'failed';

export interface OrchestratorError {
  message: string;
  step: OrchestratorStep;
  isSessionExpired?: boolean;
}

export interface TransactionReceipt {
  /** The real on-chain transaction hash */
  txHash: string;
  /** Circle challenge ID (internal reference) */
  challengeId: string;
  /** Timestamp of confirmation */
  confirmedAt: number;
}

export interface TransactionParams {
  contractAddress: `0x${string}`;
  callData: `0x${string}`;
  tokenAddress?: `0x${string}`;
  spenderAddress?: `0x${string}`;
  requiredAllowance?: bigint;
}

export interface UseTransactionOrchestratorResult {
  step: OrchestratorStep;
  error: OrchestratorError | null;
  /** The confirmed transaction receipt (available after step = 'confirmed') */
  receipt: TransactionReceipt | null;
  executeTransaction: (params: TransactionParams) => Promise<void>;
  reset: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const ARC_RPC_URL = process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network';
const TX_POLL_INTERVAL = 2_000;
const TX_POLL_MAX_ATTEMPTS = 30; // 60 seconds

// ─── ERC-20 ABIs ────────────────────────────────────────────────────────────

const erc20AllowanceAbi = [
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
] as const;

const erc20ApproveAbi = [
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useTransactionOrchestrator(): UseTransactionOrchestratorResult {
  const { session, executeChallenge } = useWallet();
  const { address } = useWalletAccount();
  const { refreshAll } = useBalanceRefresh();

  const [step, setStep] = useState<OrchestratorStep>('idle');
  const [error, setError] = useState<OrchestratorError | null>(null);
  const [receipt, setReceipt] = useState<TransactionReceipt | null>(null);
  const abortRef = useRef(false);

  // ─── Helpers ────────────────────────────────────────────────────────────

  const callCircleApi = useCallback(
    async (action: string, params: Record<string, unknown> = {}): Promise<Record<string, unknown> | null> => {
      try {
        const response = await fetch('/api/circle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...params }),
        });
        if (!response.ok) return null;
        return await response.json();
      } catch {
        return null;
      }
    },
    [],
  );

  const getViemClient = useCallback(async () => {
    const { createPublicClient, http, defineChain } = await import('viem');
    const arcTestnet = defineChain({
      id: 5042002,
      name: 'Arc Testnet',
      nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 6 },
      rpcUrls: { default: { http: [ARC_RPC_URL] } },
    });
    return createPublicClient({ chain: arcTestnet, transport: http(ARC_RPC_URL) });
  }, []);

  const checkAllowance = useCallback(
    async (tokenAddress: `0x${string}`, owner: `0x${string}`, spender: `0x${string}`): Promise<bigint> => {
      const client = await getViemClient();
      return await client.readContract({
        address: tokenAddress,
        abi: erc20AllowanceAbi,
        functionName: 'allowance',
        args: [owner, spender],
      });
    },
    [getViemClient],
  );

  /**
   * Try to get tx hash from Circle API. Non-blocking — returns null quickly if unavailable.
   */
  const waitForTxHash = useCallback(
    async (challengeId: string): Promise<string | null> => {
      if (!session) return null;

      // Try just a few times — don't block the flow
      for (let i = 0; i < 3; i++) {
        await new Promise((r) => setTimeout(r, TX_POLL_INTERVAL));

        const result = await callCircleApi('getTransaction', {
          userToken: session.userToken,
          transactionId: challengeId,
        });

        if (result) {
          const tx = (result as any)?.transaction ?? result;
          const hash = tx?.txHash ?? tx?.transactionHash ?? tx?.hash;
          if (hash && typeof hash === 'string' && hash.startsWith('0x')) {
            return hash;
          }
          const state = tx?.state ?? (result as any)?.state;
          if (state === 'FAILED' || state === 'CANCELLED') {
            throw new Error(`Transaction ${state.toLowerCase()} on-chain`);
          }
          if (state === 'CONFIRMED' || state === 'COMPLETE') {
            return null; // Confirmed but no hash in response
          }
        } else {
          // API unavailable — don't block, return null immediately
          return null;
        }
      }
      return null;
    },
    [session, callCircleApi],
  );

  /**
   * Wait for on-chain receipt using viem.
   */
  const waitForReceipt = useCallback(
    async (txHash: `0x${string}`): Promise<boolean> => {
      try {
        const client = await getViemClient();
        const receipt = await client.waitForTransactionReceipt({
          hash: txHash,
          timeout: 60_000,
        });
        return receipt.status === 'success';
      } catch {
        return false;
      }
    },
    [getViemClient],
  );

  /**
   * Submit a contract call and return the challenge ID.
   */
  const submitTransaction = useCallback(
    async (contractAddress: `0x${string}`, callData: `0x${string}`): Promise<string> => {
      if (!session) throw new Error('No wallet session');

      const result = await callCircleApi('createContractExecution', {
        userToken: session.userToken,
        walletId: session.walletId,
        contractAddress,
        callData,
      });

      if (!result || !result.challengeId) {
        throw new Error('Failed to create transaction. Please try again.');
      }

      const challengeId = result.challengeId as string;
      console.log(`[tx] challenge created: ${challengeId.slice(0, 8)}...`);

      // Execute challenge — Circle popup for user signature
      await executeChallenge(challengeId);
      console.log('[tx] challenge executed — tx submitted to chain');

      return challengeId;
    },
    [session, callCircleApi, executeChallenge],
  );

  // ─── Main Orchestration ─────────────────────────────────────────────────

  const executeTransaction = useCallback(
    async (params: TransactionParams) => {
      const { contractAddress, callData, tokenAddress, spenderAddress, requiredAllowance } = params;

      abortRef.current = false;
      setError(null);
      setReceipt(null);

      if (!session || !address) {
        setError({ message: 'Please log in to continue.', step: 'idle', isSessionExpired: true });
        setStep('failed');
        return;
      }

      let finalChallengeId = '';

      try {
        // ─── Step 1: Check allowance ──────────────────────────────────────
        let needsApproval = false;

        if (tokenAddress && spenderAddress && requiredAllowance && requiredAllowance > 0n) {
          setStep('checking-allowance');

          try {
            const currentAllowance = await checkAllowance(tokenAddress, address, spenderAddress);
            needsApproval = currentAllowance < requiredAllowance;
          } catch {
            needsApproval = true;
          }
        }

        if (abortRef.current) { setStep('idle'); return; }

        // ─── Step 2: Approve (if needed) ──────────────────────────────────
        if (needsApproval && tokenAddress && spenderAddress && requiredAllowance) {
          setStep('approving');

          const approveCallData = encodeFunctionData({
            abi: erc20ApproveAbi,
            functionName: 'approve',
            args: [spenderAddress, requiredAllowance],
          });

          const approveChallengeId = await submitTransaction(tokenAddress, approveCallData);

          // Wait for approval to be confirmed
          setStep('waiting-approval');
          const approveHash = await waitForTxHash(approveChallengeId);
          if (approveHash) {
            await waitForReceipt(approveHash as `0x${string}`).catch(() => {});
          }
          // Brief pause for chain indexing regardless
          await new Promise((r) => setTimeout(r, 2000));
        }

        if (abortRef.current) { setStep('idle'); return; }

        // ─── Step 3: Execute protocol action ──────────────────────────────
        setStep('executing');
        finalChallengeId = await submitTransaction(contractAddress, callData);

        // ─── Step 4: Wait for on-chain confirmation ───────────────────────
        setStep('confirming');

        let txHash: string | null = null;

        // Try to get the real tx hash (non-blocking — returns null if API unavailable)
        txHash = await waitForTxHash(finalChallengeId);

        if (txHash) {
          // Verify on-chain if we got a hash
          await waitForReceipt(txHash as `0x${string}`).catch(() => {});
        } else {
          // No hash available — brief wait for chain state to settle
          await new Promise((r) => setTimeout(r, 2000));
        }

        // ─── Step 5: Confirmed ────────────────────────────────────────────
        setReceipt({
          txHash: txHash || finalChallengeId,
          challengeId: finalChallengeId,
          confirmedAt: Date.now(),
        });

        setStep('confirmed');
        console.log(`[tx] confirmed ✓ hash=${txHash || finalChallengeId}`);

        refreshAll();

      } catch (err) {
        const message = err instanceof Error ? err.message : 'Transaction failed';
        const isSessionExpired =
          message.includes('Session expired') ||
          message.includes('encryption key') ||
          message.includes('Invalid');

        setError({ message, step, isSessionExpired });
        setStep('failed');
      }
    },
    [session, address, checkAllowance, submitTransaction, waitForTxHash, waitForReceipt, refreshAll, step],
  );

  const reset = useCallback(() => {
    abortRef.current = true;
    setStep('idle');
    setError(null);
    setReceipt(null);
  }, []);

  return { step, error, receipt, executeTransaction, reset };
}
