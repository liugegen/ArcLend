'use client';

import { useState, useMemo, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { encodeFunctionData, parseUnits, formatUnits } from 'viem';
import Link from 'next/link';

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
  const { state: txState, actions: txActions } = useTransactionFlow();

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

    await txActions.estimateFee(callData, ARCLEND_VAULT_ADDRESS);
  }, [parsedAmount, address, txActions]);

  // ─── Confirm Transaction ────────────────────────────────────────────────

  const handleConfirm = useCallback(async () => {
    await txActions.submitTransaction();
  }, [txActions]);

  // ─── Reset Flow ─────────────────────────────────────────────────────────

  const handleReset = useCallback(() => {
    txActions.reset();
    setAmountInput('');
    refetch();
  }, [txActions, refetch]);

  // ─── Validation ─────────────────────────────────────────────────────────

  const hasNoDebt = outstandingDebt === 0n && !isLoading;
  const isAmountValid = parsedAmount !== null && parsedAmount > 0n;
  const canEstimate =
    isAmountValid && !hasNoDebt && txState.status === 'idle';
  const canConfirm = txState.status === 'awaiting_confirmation';

  // ─── Not Connected ──────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Repay Loan</h1>
          <p className="mt-2 text-gray-600">
            Connect your wallet to repay your outstanding debt.
          </p>
        </div>
      </main>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-lg">
        {/* Back Link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Dashboard
        </Link>

        <h1 className="mt-4 text-2xl font-bold text-gray-900">Repay Loan</h1>
        <p className="mt-1 text-sm text-gray-500">
          Repay your outstanding USDC debt to free up collateral.
        </p>

        {/* Outstanding Debt Display */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Outstanding Debt</p>
          {isLoading ? (
            <div className="mt-2 h-8 w-32 animate-pulse rounded bg-gray-200" />
          ) : isError ? (
            <div className="mt-2 flex items-center gap-2 text-sm text-yellow-700">
              <span>Unable to load debt data</span>
              <button
                onClick={() => refetch()}
                className="rounded bg-yellow-100 px-2 py-1 text-xs font-medium hover:bg-yellow-200"
              >
                Retry
              </button>
            </div>
          ) : (
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {formatUSDC(outstandingDebt)} <span className="text-lg text-gray-500">USDC</span>
            </p>
          )}
        </div>

        {/* No Debt State */}
        {hasNoDebt && !isLoading && (
          <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
            You have no outstanding debt. Nothing to repay.
          </div>
        )}

        {/* Amount Input */}
        {!hasNoDebt && txState.status !== 'confirmed' && (
          <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <label
              htmlFor="repay-amount"
              className="block text-sm font-medium text-gray-700"
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
                  txState.status !== 'idle' &&
                  txState.status !== 'failed'
                }
                className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-lg font-medium text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
              />
              <button
                onClick={handleMax}
                disabled={
                  outstandingDebt === 0n ||
                  (txState.status !== 'idle' && txState.status !== 'failed')
                }
                className="rounded-lg bg-blue-100 px-3 py-3 text-sm font-semibold text-blue-700 hover:bg-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Max
              </button>
            </div>

            {/* Overpayment Warning */}
            {isOverpayment && (
              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Only{' '}
                <span className="font-semibold">
                  {formatUSDC(actualAmountApplied)} USDC
                </span>{' '}
                will be applied to your debt. The excess will be returned.
              </div>
            )}

            {/* Fee Estimate Display */}
            {txState.feeEstimate && (
              <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Estimated Gas Fee</span>
                  <span className="font-medium text-gray-900">
                    {formatUnits(txState.feeEstimate.usdcFee, USDC_DECIMALS)} USDC
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-gray-500">
                  <span>Paid via Circle Paymaster (gasless)</span>
                </div>
              </div>
            )}

            {/* Error Display */}
            {txState.error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {txState.error}
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-5">
              {txState.status === 'idle' || txState.status === 'failed' ? (
                <button
                  onClick={handleEstimateFee}
                  disabled={!canEstimate}
                  className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
                >
                  {txState.status === 'failed'
                    ? 'Retry Estimate'
                    : 'Estimate Fee'}
                </button>
              ) : txState.status === 'estimating' ? (
                <button
                  disabled
                  className="w-full rounded-lg bg-gray-300 px-4 py-3 text-sm font-semibold text-gray-500"
                >
                  <span className="inline-flex items-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Estimating...
                  </span>
                </button>
              ) : txState.status === 'awaiting_confirmation' ? (
                <button
                  onClick={handleConfirm}
                  className="w-full rounded-lg bg-green-600 px-4 py-3 text-sm font-semibold text-white hover:bg-green-700"
                >
                  Confirm Repayment
                </button>
              ) : txState.status === 'pending' ? (
                <button
                  disabled
                  className="w-full rounded-lg bg-gray-300 px-4 py-3 text-sm font-semibold text-gray-500"
                >
                  <span className="inline-flex items-center gap-2">
                    <svg
                      className="h-4 w-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Processing...
                  </span>
                </button>
              ) : null}
            </div>
          </div>
        )}

        {/* Transaction Status — Pending */}
        {txState.status === 'pending' && (
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-center gap-3">
              <svg
                className="h-5 w-5 animate-spin text-blue-600"
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              <div>
                <p className="font-medium text-blue-900">
                  Transaction Pending
                </p>
                <p className="text-sm text-blue-700">
                  Your repayment is being processed on-chain...
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Transaction Status — Confirmed */}
        {txState.status === 'confirmed' && (
          <div className="mt-6 rounded-xl border border-green-200 bg-green-50 p-5">
            <div className="flex items-center gap-3">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <div>
                <p className="font-medium text-green-900">
                  Repayment Confirmed
                </p>
                <p className="text-sm text-green-700">
                  Successfully repaid{' '}
                  <span className="font-semibold">
                    {formatUSDC(actualAmountApplied)} USDC
                  </span>{' '}
                  of your debt.
                </p>
              </div>
            </div>

            {txState.txHash && (
              <p className="mt-3 truncate text-xs text-green-600">
                Tx: {txState.txHash}
              </p>
            )}

            {/* Updated Debt Balance */}
            <div className="mt-4 rounded-lg border border-green-100 bg-white px-4 py-3">
              <p className="text-sm text-gray-500">Updated Debt Balance</p>
              <p className="mt-1 text-xl font-bold text-gray-900">
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
              className="mt-4 w-full rounded-lg border border-green-300 bg-white px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-50"
            >
              Make Another Repayment
            </button>
          </div>
        )}

        {/* Transaction Status — Failed */}
        {txState.status === 'failed' && txState.error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-5">
            <div className="flex items-center gap-3">
              <svg
                className="h-5 w-5 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
              <div>
                <p className="font-medium text-red-900">Transaction Failed</p>
                <p className="text-sm text-red-700">{txState.error}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
