'use client';

import { useState, useMemo, useCallback } from 'react';
import { useWalletAccount } from '../../../hooks/useWalletAccount';
import { encodeFunctionData, parseUnits, formatUnits } from 'viem';

import { useUserPosition } from '../../../hooks/useUserPosition';
import { useTransactionOrchestrator } from '../../../hooks/useTransactionOrchestrator';
import { TransactionProgress, TransactionError } from '../../../components/TransactionStatus';
import { TransactionSuccessModal, type TransactionSuccessData } from '../../../components/TransactionSuccessModal';
import {
  arcLendVaultAbi,
  ARCLEND_VAULT_ADDRESS,
  USDC_ADDRESS,
} from '../../../lib/contracts';

// ─── Constants ──────────────────────────────────────────────────────────────

const USDC_DECIMALS = 6;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatUSDC(amount: bigint): string {
  const divisor = BigInt(10 ** USDC_DECIMALS);
  const whole = amount / divisor;
  const fraction = (amount % divisor).toString().padStart(USDC_DECIMALS, '0');
  return `${whole.toLocaleString()}.${fraction.slice(0, 2)}`;
}

function formatUSDCFull(amount: bigint): string {
  return formatUnits(amount, USDC_DECIMALS);
}

// ─── Repay Page ─────────────────────────────────────────────────────────────

export default function RepayPage() {
  const { address, isConnected } = useWalletAccount();
  const { position, usdcPoolState, isLoading, refetch } = useUserPosition();
  const { step, error: txError, receipt, executeTransaction, reset } = useTransactionOrchestrator();

  const [amountInput, setAmountInput] = useState('');

  // ─── Compute Outstanding Debt ───────────────────────────────────────────

  const outstandingDebt: bigint = useMemo(() => {
    if (!position || !usdcPoolState) return 0n;
    if (position.borrowIndex === 0n) return 0n;
    return (position.borrowPrincipal * usdcPoolState.borrowIndex) / position.borrowIndex;
  }, [position, usdcPoolState]);

  // ─── Parse Input ────────────────────────────────────────────────────────

  const parsedAmount: bigint | null = useMemo(() => {
    if (!amountInput || amountInput.trim() === '') return null;
    try {
      const value = parseUnits(amountInput, USDC_DECIMALS);
      return value > 0n ? value : null;
    } catch {
      return null;
    }
  }, [amountInput]);

  const isOverpayment = parsedAmount !== null && outstandingDebt > 0n && parsedAmount > outstandingDebt;
  const isProcessing = step !== 'idle' && step !== 'confirmed' && step !== 'failed';
  const hasNoDebt = outstandingDebt === 0n && !isLoading;
  const isAmountValid = parsedAmount !== null && parsedAmount > 0n;

  // Success modal
  const [successData, setSuccessData] = useState<TransactionSuccessData | null>(null);
  if (step === 'confirmed' && receipt && !successData) {
    setSuccessData({
      type: 'Repay',
      amount: amountInput,
      asset: 'USDC',
      txHash: receipt.txHash,
      walletAddress: address,
      confirmedAt: receipt.confirmedAt,
    });
  }

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (value === '' || /^\d*\.?\d{0,6}$/.test(value)) {
        setAmountInput(value);
        if (step !== 'idle') reset();
      }
    },
    [step, reset],
  );

  const handleMax = useCallback(() => {
    if (outstandingDebt > 0n) {
      setAmountInput(formatUSDCFull(outstandingDebt));
    }
  }, [outstandingDebt]);

  const handleRepay = useCallback(async () => {
    if (!parsedAmount || !address) return;

    const callData = encodeFunctionData({
      abi: arcLendVaultAbi,
      functionName: 'repay',
      args: [USDC_ADDRESS, parsedAmount],
    });

    // Repay needs token approval (USDC → vault)
    await executeTransaction({
      contractAddress: ARCLEND_VAULT_ADDRESS,
      callData,
      tokenAddress: USDC_ADDRESS,
      spenderAddress: ARCLEND_VAULT_ADDRESS,
      requiredAllowance: parsedAmount,
    });
  }, [parsedAmount, address, executeTransaction]);

  const handleReset = useCallback(() => {
    reset();
    setAmountInput('');
    setSuccessData(null);
    refetch();
  }, [reset, refetch]);

  // ─── Not Connected ──────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Repay Loan</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">Connect your wallet to repay.</p>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {successData && (
        <TransactionSuccessModal data={successData} onClose={handleReset} />
      )}
      <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Repay</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Repay your outstanding USDC debt to improve your health factor.
        </p>
      </div>

      {/* Debt Overview */}
      <div className="card-base p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Outstanding Debt</p>
        {isLoading ? (
          <div className="mt-3 h-8 w-32 animate-pulse rounded-lg bg-white/[0.04]" />
        ) : (
          <p className="mt-3 text-2xl font-bold tracking-tight text-[var(--danger)]">
            {hasNoDebt ? '$0.00' : `$${formatUSDC(outstandingDebt)}`}
          </p>
        )}
        {hasNoDebt && (
          <p className="mt-2 text-xs text-[var(--success)]">You have no outstanding debt.</p>
        )}
      </div>

      {/* Repay Form */}
      <div className="card-base p-6">
        <div>
          <label htmlFor="repay-amount" className="block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Repay Amount (USDC)
          </label>
          <div className="relative mt-2">
            <input
              id="repay-amount"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amountInput}
              onChange={handleAmountChange}
              disabled={isProcessing || hasNoDebt}
              className={`block w-full rounded-xl border px-4 py-3 text-lg font-semibold text-[var(--foreground)] placeholder-[var(--muted)] transition-colors focus:outline-none focus:ring-2 disabled:opacity-50 ${
                isOverpayment
                  ? 'border-[var(--warning)]/50 bg-[var(--warning-muted)] focus:ring-[var(--warning)]/30'
                  : 'border-[var(--input-border)] bg-[var(--input-bg)] focus:border-[var(--accent)] focus:ring-[var(--input-focus)]'
              }`}
              aria-invalid={!!isOverpayment}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-[var(--muted-foreground)]">
              USDC
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-[var(--muted-foreground)]">
              Debt: {formatUSDC(outstandingDebt)} USDC
            </p>
            <button
              type="button"
              onClick={handleMax}
              disabled={isProcessing || hasNoDebt}
              className="rounded-md px-2 py-0.5 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-muted)] disabled:opacity-50"
            >
              MAX
            </button>
          </div>
          {isOverpayment && (
            <p className="mt-2 text-xs text-[var(--warning)]">
              Amount exceeds debt. Only {formatUSDC(outstandingDebt)} USDC will be applied.
            </p>
          )}
        </div>

        {/* Transaction States */}
        <TransactionProgress
          step={step}
          stepOverrides={{
            approving: { label: 'Approving USDC', detail: 'Sign the approval in your wallet' },
            executing: { label: 'Repaying debt', detail: 'Sign the repay transaction in your wallet' },
          }}
        />

        {txError && step === 'failed' && <TransactionError error={txError} />}

        {/* Action Button */}
        <div className="mt-6">
          {(step === 'idle' || step === 'failed') && (
            <button
              type="button"
              onClick={handleRepay}
              disabled={!isAmountValid || hasNoDebt}
              className="w-full rounded-xl bg-gradient-to-r from-[var(--accent)] to-purple-500 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:shadow-xl hover:shadow-[var(--accent)]/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {step === 'failed' ? 'Retry' : 'Repay'}
            </button>
          )}
          {isProcessing && (
            <button
              type="button"
              onClick={reset}
              className="w-full rounded-xl border border-[var(--card-border)] px-4 py-3.5 text-sm font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--card-hover)]"
            >
              Cancel
            </button>
          )}
        </div>

        <p className="mt-4 text-center text-[10px] text-[var(--muted-foreground)]">
          Transactions are executed via Circle Embedded Wallet on Arc Network
        </p>
      </div>
    </div>
    </>
  );
}
