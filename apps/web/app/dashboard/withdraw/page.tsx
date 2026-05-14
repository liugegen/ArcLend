'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { encodeFunctionData } from 'viem';
import { useAccount, useReadContract } from 'wagmi';

import { useWallet } from '../../../contexts/WalletContext';
import { useTransactionFlow } from '../../../hooks/useTransactionFlow';
import { useUserPosition } from '../../../hooks/useUserPosition';
import {
  arcLendVaultAbi,
  ARCLEND_VAULT_ADDRESS,
  USDC_ADDRESS,
  EURC_ADDRESS,
} from '../../../lib/contracts';

// ─── Constants ──────────────────────────────────────────────────────────────

const SUPPORTED_ASSETS = [
  { symbol: 'USDC', address: USDC_ADDRESS, decimals: 6 },
  { symbol: 'EURC', address: EURC_ADDRESS, decimals: 6 },
] as const;

type AssetSymbol = (typeof SUPPORTED_ASSETS)[number]['symbol'];

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

// ─── Withdraw Page ──────────────────────────────────────────────────────────

export default function WithdrawPage() {
  const { address, isConnected } = useAccount();
  const { session } = useWallet();
  const { position, usdcPoolState, eurcPoolState, isLoading: isPositionLoading } = useUserPosition();

  // ─── Local State ──────────────────────────────────────────────────────────

  const [selectedAsset, setSelectedAsset] = useState<AssetSymbol>('USDC');
  const [amountInput, setAmountInput] = useState('');

  const asset = useMemo(
    () => SUPPORTED_ASSETS.find((a) => a.symbol === selectedAsset)!,
    [selectedAsset],
  );

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

  // ─── Derived State ────────────────────────────────────────────────────────

  // Calculate user's withdrawable balance (shares → underlying)
  const userShares = position?.supplyShares ?? 0n;
  const poolState = selectedAsset === 'USDC' ? usdcPoolState : eurcPoolState;

  const withdrawableBalance = useMemo(() => {
    if (!poolState || poolState.totalShares === 0n) return 0n;
    return (userShares * poolState.totalDeposits) / poolState.totalShares;
  }, [userShares, poolState]);

  // Available liquidity in the pool
  const availableLiquidity = useMemo(() => {
    if (!poolState) return 0n;
    const available = poolState.totalDeposits - poolState.totalBorrows;
    return available > 0n ? available : 0n;
  }, [poolState]);

  // Max withdrawable = min(user balance, available liquidity)
  const maxWithdrawable = useMemo(() => {
    return withdrawableBalance < availableLiquidity ? withdrawableBalance : availableLiquidity;
  }, [withdrawableBalance, availableLiquidity]);

  const parsedAmount = useMemo(
    () => parseTokenAmount(amountInput, asset.decimals),
    [amountInput, asset.decimals],
  );

  // Convert amount to shares for the withdraw call
  const sharesToBurn = useMemo(() => {
    if (!poolState || poolState.totalDeposits === 0n || parsedAmount === 0n) return 0n;
    return (parsedAmount * poolState.totalShares) / poolState.totalDeposits;
  }, [parsedAmount, poolState]);

  const validationError = useMemo(() => {
    if (!amountInput) return null;
    if (parsedAmount <= 0n) return 'Amount must be greater than 0';
    if (parsedAmount > withdrawableBalance) return 'Exceeds your supply balance';
    if (parsedAmount > availableLiquidity) return 'Exceeds available pool liquidity';
    return null;
  }, [amountInput, parsedAmount, withdrawableBalance, availableLiquidity]);

  const isValidAmount = parsedAmount > 0n && !validationError;

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      if (value === '' || /^\d*\.?\d{0,6}$/.test(value)) {
        setAmountInput(value);
        if (txStatus !== 'idle') reset();
      }
    },
    [txStatus, reset],
  );

  const handleAssetChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSelectedAsset(e.target.value as AssetSymbol);
      setAmountInput('');
      reset();
    },
    [reset],
  );

  const handleMax = useCallback(() => {
    if (maxWithdrawable > 0n) {
      const formatted = formatTokenAmount(maxWithdrawable, asset.decimals).replace(/,/g, '');
      setAmountInput(formatted);
    }
  }, [maxWithdrawable, asset.decimals]);

  const handleEstimateFee = useCallback(async () => {
    if (!isValidAmount || sharesToBurn === 0n) return;

    const withdrawCallData = encodeFunctionData({
      abi: arcLendVaultAbi,
      functionName: 'withdraw',
      args: [asset.address, sharesToBurn],
    });

    await estimateFee(withdrawCallData);
  }, [isValidAmount, sharesToBurn, asset.address, estimateFee]);

  const handleConfirm = useCallback(async () => {
    await execute();
  }, [execute]);

  const handleReset = useCallback(() => {
    reset();
    setAmountInput('');
  }, [reset]);

  // ─── Not Connected State ──────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Withdraw Assets</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">Connect your wallet to withdraw.</p>
        </div>
      </div>
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Withdraw</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Withdraw your supplied assets from the lending pool.
        </p>
      </div>

      {/* Balance Card */}
      <div className="card-base p-5">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Your Supply Balance</p>
        {isPositionLoading ? (
          <div className="mt-3 h-8 w-32 animate-pulse rounded-lg bg-white/[0.04]" />
        ) : (
          <p className="mt-3 text-2xl font-bold tracking-tight text-[var(--foreground)]">
            {formatTokenAmount(withdrawableBalance, asset.decimals)} {selectedAsset}
          </p>
        )}
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Pool liquidity: {formatTokenAmount(availableLiquidity, asset.decimals)} {selectedAsset}
        </p>
      </div>

      {/* Withdraw Form */}
      <div className="card-base p-6">
        {/* Asset Selector */}
        <div>
          <label htmlFor="withdraw-asset" className="block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Asset
          </label>
          <select
            id="withdraw-asset"
            value={selectedAsset}
            onChange={handleAssetChange}
            disabled={txStatus !== 'idle' && txStatus !== 'failed'}
            className="mt-2 block w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--input-focus)] disabled:opacity-50"
          >
            {SUPPORTED_ASSETS.map((a) => (
              <option key={a.symbol} value={a.symbol}>{a.symbol}</option>
            ))}
          </select>
        </div>

        {/* Amount Input */}
        <div className="mt-5">
          <label htmlFor="withdraw-amount" className="block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Amount
          </label>
          <div className="relative mt-2">
            <input
              id="withdraw-amount"
              type="text"
              inputMode="decimal"
              placeholder="0.00"
              value={amountInput}
              onChange={handleAmountChange}
              disabled={txStatus !== 'idle' && txStatus !== 'failed'}
              className={`block w-full rounded-xl border px-4 py-3 text-lg font-semibold text-[var(--foreground)] placeholder-[var(--muted)] transition-colors focus:outline-none focus:ring-2 disabled:opacity-50 ${
                validationError
                  ? 'border-[var(--danger)]/50 bg-[var(--danger-muted)] focus:ring-[var(--danger)]/30'
                  : 'border-[var(--input-border)] bg-[var(--input-bg)] focus:border-[var(--accent)] focus:ring-[var(--input-focus)]'
              }`}
              aria-invalid={!!validationError}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-[var(--muted-foreground)]">
              {selectedAsset}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-[var(--muted-foreground)]">
              Max: {formatTokenAmount(maxWithdrawable, asset.decimals)}
            </p>
            <button
              type="button"
              onClick={handleMax}
              className="rounded-md px-2 py-0.5 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-muted)]"
            >
              MAX
            </button>
          </div>
          {validationError && (
            <p className="mt-2 text-xs font-medium text-[var(--danger)]" role="alert">{validationError}</p>
          )}
        </div>

        {/* Fee Estimate */}
        {feeEstimate && (txStatus === 'confirming' || txStatus === 'signing' || txStatus === 'submitting' || txStatus === 'pending') && (
          <div className="mt-5 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Gas Fee</span>
              <span className="font-semibold text-[var(--foreground)]">
                {formatTokenAmount(feeEstimate.usdcFee, 6)} USDC
              </span>
            </div>
            <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">Sponsored by Circle Paymaster</p>
          </div>
        )}

        {/* Paymaster Unavailable */}
        {paymasterUnavailable && (
          <div className="mt-5 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-muted)] p-4">
            <p className="text-sm font-medium text-[var(--warning)]">Paymaster Unavailable</p>
            <p className="mt-1 text-xs text-[var(--warning)]/80">You can pay gas in ARC token directly.</p>
          </div>
        )}

        {/* Error */}
        {txError && txStatus === 'failed' && (
          <div className="mt-5 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-muted)] p-4">
            <p className="text-sm text-[var(--danger)]">{txError.message}</p>
          </div>
        )}

        {/* Transaction Progress */}
        {(txStatus === 'signing' || txStatus === 'submitting' || txStatus === 'pending') && (
          <div className="mt-5 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-muted)] p-4">
            <div className="flex items-center gap-3">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
              <span className="text-sm font-medium text-[var(--accent)]">
                {txStatus === 'signing' && 'Signing...'}
                {txStatus === 'submitting' && 'Submitting...'}
                {txStatus === 'pending' && 'Confirming...'}
              </span>
            </div>
          </div>
        )}

        {/* Confirmed */}
        {txStatus === 'confirmed' && (
          <div className="mt-5 rounded-xl border border-[var(--success)]/30 bg-[var(--success-muted)] p-4">
            <div className="flex items-center gap-3">
              <svg className="h-5 w-5 text-[var(--success)]" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="text-sm font-semibold text-[var(--success)]">Withdrawal confirmed!</span>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="mt-3 text-sm font-medium text-[var(--success)] hover:opacity-80"
            >
              Withdraw more →
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6">
          {txStatus === 'idle' || txStatus === 'failed' ? (
            <button
              type="button"
              onClick={handleEstimateFee}
              disabled={!isValidAmount}
              className="w-full rounded-xl bg-gradient-to-r from-[var(--accent)] to-purple-500 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:shadow-xl hover:shadow-[var(--accent)]/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {txStatus === 'failed' ? 'Retry' : 'Withdraw'}
            </button>
          ) : txStatus === 'estimating' ? (
            <button disabled className="w-full rounded-xl bg-[var(--accent)] px-4 py-3.5 text-sm font-semibold text-white opacity-60">
              Estimating...
            </button>
          ) : txStatus === 'confirming' ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={reset}
                className="flex-1 rounded-xl border border-[var(--card-border)] px-4 py-3.5 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--card-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-1 rounded-xl bg-gradient-to-r from-[var(--accent)] to-purple-500 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:shadow-xl"
              >
                Confirm
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
