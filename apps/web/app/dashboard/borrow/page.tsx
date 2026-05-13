'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { encodeFunctionData } from 'viem';
import { useAccount, useReadContract } from 'wagmi';

import { useTransactionFlow } from '../../../hooks/useTransactionFlow';
import { useHealthFactor } from '../../../hooks/useHealthFactor';
import { useUserPosition } from '../../../hooks/useUserPosition';
import {
  arcLendVaultAbi,
  priceOracleAbi,
  ARCLEND_VAULT_ADDRESS,
  PRICE_ORACLE_ADDRESS,
  USDC_ADDRESS,
  USYC_ADDRESS,
} from '../../../lib/contracts';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default collateral factor (80%) — used for client-side HF preview */
const DEFAULT_COLLATERAL_FACTOR = 0.8;

/** USDC has 6 decimals */
const USDC_DECIMALS = 6;

/** USYC has 18 decimals */
const USYC_DECIMALS = 18;

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTokenAmount(amount: bigint, decimals = 6): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = (amount % divisor).toString().padStart(decimals, '0').slice(0, 2);
  return `${whole.toLocaleString()}.${fraction}`;
}

function parseTokenAmount(value: string, decimals = 6): bigint {
  if (!value || value === '.' || value === '0.') return 0n;
  const [wholePart = '0', fracPart = ''] = value.split('.');
  const paddedFrac = fracPart.padEnd(decimals, '0').slice(0, decimals);
  return BigInt(wholePart) * BigInt(10 ** decimals) + BigInt(paddedFrac);
}

function formatHealthFactor(hf: number | null): string {
  if (hf == null) return '—';
  if (hf > 100) return '∞';
  return hf.toFixed(4);
}

function getHealthFactorColor(hf: number | null): string {
  if (hf == null) return 'text-gray-400';
  if (hf < 1.0) return 'text-red-600';
  if (hf <= 1.2) return 'text-orange-500';
  return 'text-green-600';
}

// ─── Borrow Page ────────────────────────────────────────────────────────────

export default function BorrowPage() {
  const { address, isConnected } = useAccount();

  // ─── Local State ──────────────────────────────────────────────────────────

  const [amountInput, setAmountInput] = useState('');

  // ─── Transaction Flow ─────────────────────────────────────────────────────

  const {
    status: txStatus,
    feeEstimate,
    error: txError,
    paymasterUnavailable,
    estimateFee,
    execute,
    reset,
  } = useTransactionFlow();

  // ─── On-Chain Reads ───────────────────────────────────────────────────────

  const { healthFactor, isWarning, isLiquidatable } = useHealthFactor();
  const { position, usdcPoolState } = useUserPosition();

  // Read USYC collateral price from oracle (8 decimals)
  const { data: usycPriceData } = useReadContract({
    address: PRICE_ORACLE_ADDRESS,
    abi: priceOracleAbi,
    functionName: 'getAssetPrice',
    args: [USYC_ADDRESS],
    query: { enabled: isConnected, refetchInterval: 15_000 },
  });

  const usycPrice = (usycPriceData as bigint | undefined) ?? 0n;

  // ─── Derived State ────────────────────────────────────────────────────────

  const collateralBalance = position?.collateralBalance ?? 0n;

  // Collateral value in USD (collateralBalance * price / 10^(USYC_DECIMALS + ORACLE_PRICE_DECIMALS - USDC_DECIMALS))
  // This gives us the value in USDC-equivalent (6 decimals)
  const collateralValueUsd = useMemo(() => {
    if (collateralBalance === 0n || usycPrice === 0n) return 0n;
    // collateralBalance is 18 decimals, price is 8 decimals
    // Result in 6 decimals: (balance * price) / 10^(18 + 8 - 6) = / 10^20
    return (collateralBalance * usycPrice) / BigInt(10 ** 20);
  }, [collateralBalance, usycPrice]);

  // Current debt in USDC (6 decimals)
  const currentDebt = useMemo(() => {
    if (!position || !usdcPoolState) return 0n;
    if (position.borrowIndex === 0n) return 0n;
    return (position.borrowPrincipal * usdcPoolState.borrowIndex) / position.borrowIndex;
  }, [position, usdcPoolState]);

  const parsedAmount = useMemo(
    () => parseTokenAmount(amountInput, USDC_DECIMALS),
    [amountInput],
  );

  // Available pool liquidity
  const availableLiquidity = useMemo(() => {
    if (!usdcPoolState) return 0n;
    const available = usdcPoolState.totalDeposits - usdcPoolState.totalBorrows;
    return available > 0n ? available : 0n;
  }, [usdcPoolState]);

  // Projected HF after borrow: (collateralValue * CF) / (currentDebt + newBorrow)
  const projectedHealthFactor = useMemo((): number | null => {
    if (parsedAmount <= 0n) return healthFactor;
    if (collateralValueUsd === 0n) return 0;

    const totalDebtAfter = currentDebt + parsedAmount;
    if (totalDebtAfter === 0n) return null;

    // HF = (collateralValueUsd * CF) / totalDebtAfter
    // Both collateralValueUsd and totalDebtAfter are in 6 decimals
    const numerator = Number(collateralValueUsd) * DEFAULT_COLLATERAL_FACTOR;
    const denominator = Number(totalDebtAfter);

    if (denominator === 0) return null;
    return numerator / denominator;
  }, [parsedAmount, collateralValueUsd, currentDebt, healthFactor]);

  // Validation
  const validationError = useMemo((): string | null => {
    if (!amountInput) return null;
    if (parsedAmount <= 0n) return 'Amount must be greater than 0';
    if (parsedAmount < parseTokenAmount('0.01', USDC_DECIMALS))
      return 'Minimum borrow amount is 0.01 USDC';
    if (usdcPoolState?.borrowsPaused) return 'Borrowing is currently paused';
    if (parsedAmount > availableLiquidity) return 'Insufficient pool liquidity';
    if (collateralBalance === 0n) return 'No collateral deposited';
    if (projectedHealthFactor != null && projectedHealthFactor < 1.0)
      return 'Borrow would cause undercollateralization (HF < 1.0)';
    return null;
  }, [
    amountInput,
    parsedAmount,
    usdcPoolState,
    availableLiquidity,
    collateralBalance,
    projectedHealthFactor,
  ]);

  const isValidAmount = parsedAmount > 0n && !validationError;

  // Determine if confirm button should be disabled
  const isConfirmDisabled = !isValidAmount || (projectedHealthFactor != null && projectedHealthFactor < 1.0);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // Allow only valid decimal input (up to 6 decimal places)
      if (value === '' || /^\d*\.?\d{0,6}$/.test(value)) {
        setAmountInput(value);
        if (txStatus !== 'idle') {
          reset();
        }
      }
    },
    [txStatus, reset],
  );

  const handleEstimateFee = useCallback(async () => {
    if (!isValidAmount) return;

    const borrowCallData = encodeFunctionData({
      abi: arcLendVaultAbi,
      functionName: 'borrow',
      args: [USDC_ADDRESS, parsedAmount],
    });

    await estimateFee(borrowCallData);
  }, [isValidAmount, parsedAmount, estimateFee]);

  const handleConfirm = useCallback(async () => {
    await execute();
  }, [execute]);

  const handleReset = useCallback(() => {
    reset();
    setAmountInput('');
  }, [reset]);

  // ─── Map transaction errors to user-friendly messages ─────────────────────

  const displayError = useMemo((): string | null => {
    if (!txError) return null;

    const msg = txError.message.toLowerCase();

    if (msg.includes('undercollateralized') || msg.includes('health factor')) {
      return 'Cannot borrow: your position would become undercollateralized. Add more collateral or reduce the borrow amount.';
    }
    if (msg.includes('paused') || msg.includes('borrow')) {
      return 'Borrowing is currently paused by the protocol administrator. Please try again later.';
    }
    if (msg.includes('liquidity') || msg.includes('insufficient')) {
      return 'Insufficient liquidity in the lending pool. Try a smaller amount or wait for more deposits.';
    }

    return txError.message;
  }, [txError]);

  // ─── Not Connected State ──────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Borrow USDC</h1>
          <p className="mt-2 text-gray-600">Connect your wallet to borrow assets.</p>
        </div>
      </main>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-lg">
        {/* Back Link */}
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>

        {/* Page Header */}
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Borrow</h1>
        <p className="mt-1 text-sm text-gray-500">
          Borrow USDC against your USYC collateral.
        </p>

        {/* Collateral Info Card */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-medium text-gray-500">Your Collateral (USYC)</h2>
          <div className="mt-2 flex items-baseline justify-between">
            <p className="text-xl font-bold text-gray-900">
              {formatTokenAmount(collateralBalance, USYC_DECIMALS)} USYC
            </p>
            <p className="text-sm text-gray-500">
              ≈ ${formatTokenAmount(collateralValueUsd, USDC_DECIMALS)}
            </p>
          </div>
          {collateralBalance === 0n && (
            <p className="mt-2 text-xs text-amber-600">
              You need to deposit USYC collateral before borrowing.
            </p>
          )}
        </div>

        {/* Health Factor Display */}
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-medium text-gray-500">Current Health Factor</h2>
              <p className={`mt-1 text-2xl font-bold ${getHealthFactorColor(healthFactor)}`}>
                {formatHealthFactor(healthFactor)}
              </p>
            </div>
            {parsedAmount > 0n && projectedHealthFactor != null && (
              <div className="text-right">
                <h2 className="text-sm font-medium text-gray-500">After Borrow</h2>
                <p className={`mt-1 text-2xl font-bold ${getHealthFactorColor(projectedHealthFactor)}`}>
                  {formatHealthFactor(projectedHealthFactor)}
                </p>
              </div>
            )}
          </div>

          {/* HF Change Arrow */}
          {parsedAmount > 0n && projectedHealthFactor != null && healthFactor != null && (
            <div className="mt-3 flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
              <span className={`text-sm font-medium ${getHealthFactorColor(healthFactor)}`}>
                {formatHealthFactor(healthFactor)}
              </span>
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className={`text-sm font-medium ${getHealthFactorColor(projectedHealthFactor)}`}>
                {formatHealthFactor(projectedHealthFactor)}
              </span>
              {projectedHealthFactor < 1.0 && (
                <span className="ml-auto text-xs font-medium text-red-600">Liquidatable</span>
              )}
              {projectedHealthFactor >= 1.0 && projectedHealthFactor <= 1.2 && (
                <span className="ml-auto text-xs font-medium text-orange-600">High Risk</span>
              )}
            </div>
          )}

          {/* Liquidation Warning */}
          {isWarning && (
            <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
              <p className="text-xs text-orange-800">
                ⚠️ Your current Health Factor is low. Borrowing more may increase liquidation risk.
              </p>
            </div>
          )}
        </div>

        {/* Borrow Form Card */}
        <div className="mt-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {/* Amount Input */}
          <div>
            <label htmlFor="borrow-amount-input" className="block text-sm font-medium text-gray-700">
              Borrow Amount (USDC)
            </label>
            <div className="relative mt-1">
              <input
                id="borrow-amount-input"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountInput}
                onChange={handleAmountChange}
                disabled={txStatus !== 'idle' && txStatus !== 'failed'}
                className={`block w-full rounded-lg border px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 disabled:opacity-50 ${
                  validationError
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:border-blue-500 focus:ring-blue-500'
                }`}
                aria-describedby="borrow-info"
                aria-invalid={!!validationError}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                USDC
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <p id="borrow-info" className="text-xs text-gray-500">
                Available liquidity: {formatTokenAmount(availableLiquidity, USDC_DECIMALS)} USDC
              </p>
              {currentDebt > 0n && (
                <p className="text-xs text-gray-500">
                  Current debt: {formatTokenAmount(currentDebt, USDC_DECIMALS)} USDC
                </p>
              )}
            </div>
            {validationError && (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {validationError}
              </p>
            )}
          </div>

          {/* Fee Estimate Display */}
          {feeEstimate && (txStatus === 'confirming' || txStatus === 'signing' || txStatus === 'submitting' || txStatus === 'pending') && (
            <div className="mt-4 rounded-lg border border-gray-100 bg-gray-50 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Estimated Gas Fee</span>
                <span className="font-medium text-gray-900">
                  {formatTokenAmount(feeEstimate.usdcFee, 6)} USDC
                </span>
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Paid via Circle Paymaster — no ARC token needed
              </p>
            </div>
          )}

          {/* Paymaster Unavailable Fallback */}
          {paymasterUnavailable && (
            <div className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3">
              <p className="text-sm font-medium text-orange-800">Paymaster Unavailable</p>
              <p className="mt-1 text-xs text-orange-700">
                Gas sponsorship is temporarily unavailable. You can pay gas in ARC token directly.
              </p>
            </div>
          )}

          {/* Transaction Error */}
          {displayError && txStatus === 'failed' && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-800">{displayError}</p>
            </div>
          )}

          {/* Transaction Status Indicator */}
          {(txStatus === 'signing' || txStatus === 'submitting' || txStatus === 'pending') && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <svg
                  className="h-4 w-4 animate-spin text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
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
                <span className="text-sm font-medium text-blue-800">
                  {txStatus === 'signing' && 'Signing transaction...'}
                  {txStatus === 'submitting' && 'Submitting transaction...'}
                  {txStatus === 'pending' && 'Waiting for confirmation...'}
                </span>
              </div>
            </div>
          )}

          {/* Confirmed Status */}
          {txStatus === 'confirmed' && (
            <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-green-600" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
                <span className="text-sm font-medium text-green-800">
                  Borrow confirmed! USDC has been transferred to your wallet.
                </span>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="mt-2 text-sm font-medium text-green-700 hover:text-green-800"
              >
                Borrow more
              </button>
            </div>
          )}

          {/* Action Buttons */}
          <div className="mt-6">
            {txStatus === 'idle' || txStatus === 'failed' ? (
              <button
                type="button"
                onClick={handleEstimateFee}
                disabled={isConfirmDisabled}
                className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {txStatus === 'failed' ? 'Retry' : 'Estimate Fee & Borrow'}
              </button>
            ) : txStatus === 'estimating' ? (
              <button
                type="button"
                disabled
                className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white opacity-50"
              >
                Estimating fee...
              </button>
            ) : txStatus === 'confirming' ? (
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={reset}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isConfirmDisabled}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Confirm Borrow
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
