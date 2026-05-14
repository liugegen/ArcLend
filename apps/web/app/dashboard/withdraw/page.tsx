'use client';

import { useCallback, useMemo, useState } from 'react';
import { encodeFunctionData } from 'viem';

import { useWallet } from '../../../contexts/WalletContext';
import { useWalletAccount } from '../../../hooks/useWalletAccount';
import { useTransactionOrchestrator } from '../../../hooks/useTransactionOrchestrator';
import { useUserPosition } from '../../../hooks/useUserPosition';
import { TransactionProgress, TransactionError } from '../../../components/TransactionStatus';
import { TransactionSuccessModal, type TransactionSuccessData } from '../../../components/TransactionSuccessModal';
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
  const { address, isConnected } = useWalletAccount();
  const { session } = useWallet();
  const { position, usdcPoolState, eurcPoolState, isLoading: isPositionLoading } = useUserPosition();

  const [selectedAsset, setSelectedAsset] = useState<AssetSymbol>('USDC');
  const [amountInput, setAmountInput] = useState('');

  const asset = useMemo(
    () => SUPPORTED_ASSETS.find((a) => a.symbol === selectedAsset)!,
    [selectedAsset],
  );

  const { step, error, receipt, executeTransaction, reset } = useTransactionOrchestrator();

  // ─── Derived State ────────────────────────────────────────────────────────

  // Use per-asset shares (not the legacy single-asset field)
  const userShares = selectedAsset === 'USDC'
    ? (position?.usdcShares ?? 0n)
    : (position?.eurcShares ?? 0n);
  const poolState = selectedAsset === 'USDC' ? usdcPoolState : eurcPoolState;

  const withdrawableBalance = useMemo(() => {
    if (!poolState || poolState.totalShares === 0n) return 0n;
    return (userShares * poolState.totalDeposits) / poolState.totalShares;
  }, [userShares, poolState]);

  const availableLiquidity = useMemo(() => {
    if (!poolState) return 0n;
    const available = poolState.totalDeposits - poolState.totalBorrows;
    return available > 0n ? available : 0n;
  }, [poolState]);

  const maxWithdrawable = useMemo(() => {
    return withdrawableBalance < availableLiquidity ? withdrawableBalance : availableLiquidity;
  }, [withdrawableBalance, availableLiquidity]);

  const parsedAmount = useMemo(
    () => parseTokenAmount(amountInput, asset.decimals),
    [amountInput, asset.decimals],
  );

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
  const isProcessing = step !== 'idle' && step !== 'confirmed' && step !== 'failed';

  // Success modal state
  const [successData, setSuccessData] = useState<TransactionSuccessData | null>(null);
  if (step === 'confirmed' && receipt && !successData) {
    setSuccessData({
      type: 'Withdraw',
      amount: amountInput,
      asset: selectedAsset,
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
      setAmountInput(formatTokenAmount(maxWithdrawable, asset.decimals).replace(/,/g, ''));
    }
  }, [maxWithdrawable, asset.decimals]);

  const handleWithdraw = useCallback(async () => {
    if (!isValidAmount || sharesToBurn === 0n) return;

    const withdrawCallData = encodeFunctionData({
      abi: arcLendVaultAbi,
      functionName: 'withdraw',
      args: [asset.address, sharesToBurn],
    });

    // Withdraw doesn't need token approval — just execute directly
    await executeTransaction({
      contractAddress: ARCLEND_VAULT_ADDRESS,
      callData: withdrawCallData,
    });
  }, [isValidAmount, sharesToBurn, asset.address, executeTransaction]);

  const handleReset = useCallback(() => {
    reset();
    setAmountInput('');
    setSuccessData(null);
  }, [reset]);

  // ─── Not Connected ────────────────────────────────────────────────────────

  if (!isConnected && !session) {
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
    <>
      {successData && (
        <TransactionSuccessModal data={successData} onClose={handleReset} />
      )}
      <div className="mx-auto max-w-lg space-y-6">
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
        <div>
          <label htmlFor="withdraw-asset" className="block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Asset
          </label>
          <select
            id="withdraw-asset"
            value={selectedAsset}
            onChange={handleAssetChange}
            disabled={isProcessing}
            className="mt-2 block w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--input-focus)] disabled:opacity-50"
          >
            {SUPPORTED_ASSETS.map((a) => (
              <option key={a.symbol} value={a.symbol}>{a.symbol}</option>
            ))}
          </select>
        </div>

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
              disabled={isProcessing}
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
            <button type="button" onClick={handleMax} disabled={isProcessing} className="rounded-md px-2 py-0.5 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-muted)] disabled:opacity-50">
              MAX
            </button>
          </div>
          {validationError && (
            <p className="mt-2 text-xs font-medium text-[var(--danger)]" role="alert">{validationError}</p>
          )}
        </div>

        {/* Transaction States */}
        <TransactionProgress
          step={step}
          stepOverrides={{
            executing: { label: 'Withdrawing assets', detail: 'Sign the withdrawal in your wallet' },
          }}
        />

        {error && step === 'failed' && <TransactionError error={error} />}

        {/* Action Button */}
        <div className="mt-6">
          {(step === 'idle' || step === 'failed') && (
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={!isValidAmount}
              className="w-full rounded-xl bg-gradient-to-r from-[var(--accent)] to-purple-500 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:shadow-xl hover:shadow-[var(--accent)]/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {step === 'failed' ? 'Retry' : 'Withdraw'}
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
