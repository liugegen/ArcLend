'use client';

import { useState, useMemo, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { encodeFunctionData, parseUnits, formatUnits } from 'viem';

import { useUserPosition } from '../../../hooks/useUserPosition';
import { useTransactionFlow } from '../../../hooks/useTransactionFlow';
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
  const { address, isConnected } = useAccount();
  const { position, usdcPoolState, isLoading, isError, refetch } =
    useUserPosition();
  const {
    status: txStatus,
    feeEstimate: txFeeEstimate,
    error: txError,
    paymasterUnavailable,
    estimateFee,
    execute,
    reset: txReset,
  } = useTransactionFlow();

  const [amountInput, setAmountInput] = useState('');

  // ─── Compute Outstanding Debt ───────────────────────────────────────────

  const outstandingDebt: bigint = useMemo(() => {
    if (!position || !usdcPoolState) return 0n;
    if (position.borrowIndex === 0n) return 0n;

    // debt = principal × currentBorrowIndex / userBorrowIndex
    return (
      (position.borrowPrincipal * usdcPoolState.borrowIndex) /
      position.borrowIndex
    );
  }, [position, usdcPoolState]);

  // ─── Parse Input Amount ─────────────────────────────────────────────────

  const parsedAmount: bigint | null = useMemo(() => {
    if (!amountInput || amountInput.trim() === '') return null;
    try {
      const value = parseUnits(amountInput, USDC_DECIMALS);
      return value > 0n ? value : null;
    } catch {
      return null;
    }
  }, [amountInput]);

  // ─── Overpayment Detection ──────────────────────────────────────────────

  const isOverpayment =
    parsedAmount !== null && outstandingDebt > 0n && parsedAmount > outstandingDebt;

  const actualAmountApplied: bigint = useMemo(() => {
    if (parsedAmount === null) return 0n;
    if (outstandingDebt === 0n) return 0n;
    return parsedAmount > outstandingDebt ? outstandingDebt : parsedAmount;
  }, [parsedAmount, outstandingDebt]);

  // ─── Max Button Handler ─────────────────────────────────────────────────

  const handleMax = useCallback(() => {
    if (outstandingDebt > 0n) {
      setAmountInput(formatUSDCFull(outstandingDebt));
    }
  }, [outstandingDebt]);

  // ─── Estimate Fee ───────────────────────────────────────────────────────

  const handleEstimateFee = useCallback(async () => {
    if (!parsedAmount || !address) return;

    const callData = encodeFunctionData({
      abi: arcLendVaultAbi,
      functionName: 'repay',
      args: [USDC_ADDRESS, parsedAmount],
    });

    await estimateFee(callData);
  }, [parsedAmount, address, estimateFee]);

  // ─── Confirm Transaction ────────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    await execute();
  }, [execute]);

  // ─── Reset Flow ─────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    txReset();
    setAmountInput('');
    refetch();
  }, [txReset, refetch]);

  // ─── Validation ─────────────────────────────────────────────────────────

  const hasNoDebt = outstandingDebt === 0n && !isLoading;
  const isAmountValid = parsedAmount !== null && parsedAmount > 0n;
  const canEstimate =
    isAmountValid && !hasNoDebt && txStatus === 'idle';
  const canConfirm = txStatus === 'confirming';

  // ─── Not Connected ──────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Repay Loan</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">
            Connect your wallet to repay your outstanding debt.
          </p>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Repay</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Repay your outstanding USDC debt to free up collateral.
        </p>
      </div>

      {/* Outstanding Debt Display */}
      <div className="card-base p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Outstanding Debt</p>
        {isLoading ? (
          <div className="mt-3 h-8 w-32 animate-pulse rounded-lg bg-white/[0.04]" />
        ) : isError ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-[var(--warning)]">
            <span>Unable to load debt data</span>
            <button
              onClick={() => refetch()}
              className="rounded-lg bg-[var(--warning-muted)] px-2 py-1 text-xs font-medium hover:opacity-80"
            >
              Retry
            </button>
          </div>
        ) : (
          <p className="mt-3 text-3xl font-bold tracking-tight text-[var(--foreground)]">
            {formatUSDC(outstandingDebt)} <span className="text-lg text-[var(--muted-foreground)]">USDC</span>
          </p>
        )}
      </div>

      {/* No Debt State */}
      {hasNoDebt && !isLoading && (
        <div className="rounded-xl border border-[var(--success)]/30 bg-[var(--success-muted)] px-4 py-3 text-sm text-[var(--success)]">
          You have no outstanding debt. Nothing to repay.
        </div>
      )}

      {/* Amount Input */}
      {!hasNoDebt && txStatus !== 'confirmed' && (
        <div className="card-base p-6">
          <label
            htmlFor="repay-amount"
            className="block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]"
          >
            Repay Amount (USDC)
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="repay-amount"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              disabled={
                txStatus !== 'idle' &&
                txStatus !== 'failed'
              }
              className="flex-1 rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-lg font-semibold text-[var(--foreground)] placeholder-[var(--muted)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--input-focus)] disabled:opacity-50"
            />
            <button
              onClick={handleMax}
              disabled={
                outstandingDebt === 0n ||
                (txStatus !== 'idle' && txStatus !== 'failed')
              }
              className="rounded-xl bg-[var(--accent-muted)] px-4 py-3 text-sm font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Max
            </button>
          </div>

          {/* Overpayment Warning */}
          {isOverpayment && (
            <div className="mt-3 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-muted)] px-3 py-2 text-sm text-[var(--warning)]">
              Only{' '}
              <span className="font-semibold">
                {formatUSDC(actualAmountApplied)} USDC
              </span>{' '}
              will be applied to your debt. The excess will be returned.
            </div>
          )}

          {/* Fee Estimate Display */}
          {txFeeEstimate && (
            <div className="mt-5 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[var(--muted-foreground)]">Gas Fee</span>
                <span className="font-semibold text-[var(--foreground)]">
                  {formatUnits(txFeeEstimate.usdcFee, USDC_DECIMALS)} USDC
                </span>
              </div>
              <div className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                <span>Paid via Circle Paymaster (gasless)</span>
              </div>
            </div>
          )}

          {/* Error Display */}
          {txError && (
            <div className="mt-3 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-muted)] px-3 py-2 text-sm text-[var(--danger)]">
              {txError.message}
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-6">
            {txStatus === 'idle' || txStatus === 'failed' ? (
              <button
                onClick={handleEstimateFee}
                disabled={!canEstimate}
                className="w-full rounded-xl bg-gradient-to-r from-[var(--accent)] to-purple-500 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:shadow-xl hover:shadow-[var(--accent)]/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                {txStatus === 'failed' ? 'Retry' : 'Repay'}
              </button>
            ) : txStatus === 'estimating' ? (
              <button
                disabled
                className="w-full rounded-xl bg-[var(--accent)] px-4 py-3.5 text-sm font-semibold text-white opacity-60"
              >
                <span className="inline-flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Estimating...
                </span>
              </button>
            ) : txStatus === 'confirming' ? (
              <button
                onClick={handleConfirm}
                className="w-full rounded-xl bg-gradient-to-r from-[var(--success)] to-emerald-400 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--success)]/20 transition-all hover:shadow-xl"
              >
                Confirm Repayment
              </button>
            ) : txStatus === 'pending' || txStatus === 'signing' || txStatus === 'submitting' ? (
              <button
                disabled
                className="w-full rounded-xl bg-[var(--accent)] px-4 py-3.5 text-sm font-semibold text-white opacity-60"
              >
                <span className="inline-flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Processing...
                </span>
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Transaction Status — Pending */}
      {(txStatus === 'pending' || txStatus === 'signing' || txStatus === 'submitting') && (
        <div className="rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-muted)] p-5">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
            <div>
              <p className="font-medium text-[var(--accent)]">Transaction Pending</p>
              <p className="text-sm text-[var(--accent)]/80">
                Your repayment is being processed on-chain...
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Status — Confirmed */}
      {txStatus === 'confirmed' && (
        <div className="rounded-xl border border-[var(--success)]/30 bg-[var(--success-muted)] p-5">
          <div className="flex items-center gap-3">
            <svg className="h-6 w-6 text-[var(--success)]" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="font-medium text-[var(--success)]">Repayment Confirmed</p>
              <p className="text-sm text-[var(--success)]/80">
                Successfully repaid{' '}
                <span className="font-semibold">
                  {formatUSDC(actualAmountApplied)} USDC
                </span>{' '}
                of your debt.
              </p>
            </div>
          </div>

          {/* Updated Debt Balance */}
          <div className="mt-4 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3">
            <p className="text-xs text-[var(--muted-foreground)]">Updated Debt Balance</p>
            <p className="mt-1 text-xl font-bold text-[var(--foreground)]">
              {formatUSDC(
                outstandingDebt > actualAmountApplied
                  ? outstandingDebt - actualAmountApplied
                  : 0n,
              )}{' '}
              USDC
            </p>
          </div>

          <button
            onClick={handleReset}
            className="mt-4 w-full rounded-xl border border-[var(--success)]/30 px-4 py-2.5 text-sm font-medium text-[var(--success)] transition-colors hover:bg-[var(--success-muted)]"
          >
            Make Another Repayment
          </button>
        </div>
      )}

      {/* Transaction Status — Failed */}
      {txStatus === 'failed' && txError && (
        <div className="rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-muted)] p-5">
          <div className="flex items-center gap-3">
            <svg className="h-5 w-5 text-[var(--danger)]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            <div>
              <p className="font-medium text-[var(--danger)]">Transaction Failed</p>
              <p className="text-sm text-[var(--danger)]/80">{txError.message}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
