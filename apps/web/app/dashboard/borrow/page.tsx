'use client';

import { useCallback, useMemo, useState } from 'react';
import { encodeFunctionData } from 'viem';

import { useWalletAccount } from '../../../hooks/useWalletAccount';
import { useTransactionOrchestrator } from '../../../hooks/useTransactionOrchestrator';
import { useHealthFactor } from '../../../hooks/useHealthFactor';
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

const COLLATERAL_FACTOR = 0.8;
const USDC_DECIMALS = 6;

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

// ─── Borrow Page ────────────────────────────────────────────────────────────

export default function BorrowPage() {
  const { address, isConnected } = useWalletAccount();
  const [amountInput, setAmountInput] = useState('');
  const [borrowAsset, setBorrowAsset] = useState<'USDC' | 'EURC'>('USDC');

  const borrowAssetAddress = borrowAsset === 'USDC' ? USDC_ADDRESS : EURC_ADDRESS;

  const { step, error: txError, receipt, executeTransaction, reset } = useTransactionOrchestrator();
  const { healthFactor, isWarning, isLiquidatable } = useHealthFactor();
  const { position, usdcPoolState } = useUserPosition();

  // ─── Derived State ────────────────────────────────────────────────────────

  // In v2, supplied assets automatically serve as collateral.
  // Borrow power = total supplied value × collateral factor (80%)
  const suppliedBalance = useMemo(() => {
    // Use total collateral value from contract (sum of all supplied positions)
    return position?.collateralBalance ?? 0n;
  }, [position]);

  // Collateral value = total supply value (returned by getUserPosition.collateralBalance)
  const collateralValueUsd = suppliedBalance;

  // Borrow power = collateral value * collateral factor
  const borrowPower = useMemo(() => {
    return (collateralValueUsd * 80n) / 100n;
  }, [collateralValueUsd]);

  // Current debt in USDC (6 decimals)
  const currentDebt = useMemo(() => {
    if (!position || !usdcPoolState) return 0n;
    if (position.borrowIndex === 0n) return 0n;
    return (position.borrowPrincipal * usdcPoolState.borrowIndex) / position.borrowIndex;
  }, [position, usdcPoolState]);

  // Available to borrow = borrow power - current debt
  const availableToBorrow = useMemo(() => {
    const available = borrowPower - currentDebt;
    return available > 0n ? available : 0n;
  }, [borrowPower, currentDebt]);

  const parsedAmount = useMemo(() => parseTokenAmount(amountInput, USDC_DECIMALS), [amountInput]);

  // Pool liquidity
  const availableLiquidity = useMemo(() => {
    if (!usdcPoolState) return 0n;
    const available = usdcPoolState.totalDeposits - usdcPoolState.totalBorrows;
    return available > 0n ? available : 0n;
  }, [usdcPoolState]);

  // Projected HF
  const projectedHealthFactor = useMemo((): number | null => {
    if (parsedAmount <= 0n) return healthFactor;
    if (collateralValueUsd === 0n) return 0;
    const totalDebtAfter = currentDebt + parsedAmount;
    if (totalDebtAfter === 0n) return null;
    return (Number(collateralValueUsd) * COLLATERAL_FACTOR) / Number(totalDebtAfter);
  }, [parsedAmount, collateralValueUsd, currentDebt, healthFactor]);

  // Validation
  const validationError = useMemo((): string | null => {
    if (!amountInput) return null;
    if (parsedAmount <= 0n) return 'Amount must be greater than 0';
    if (usdcPoolState?.borrowsPaused) return 'Borrowing is currently paused';
    if (parsedAmount > availableLiquidity) return 'Insufficient pool liquidity';
    if (suppliedBalance === 0n) return 'No collateral — supply assets first';
    if (parsedAmount > availableToBorrow) return 'Exceeds your borrow power';
    if (projectedHealthFactor != null && projectedHealthFactor < 1.0)
      return 'Would cause liquidation risk (Health Factor < 1.0)';
    return null;
  }, [amountInput, parsedAmount, usdcPoolState, availableLiquidity, suppliedBalance, availableToBorrow, projectedHealthFactor]);

  const isValidAmount = parsedAmount > 0n && !validationError;
  const isProcessing = step !== 'idle' && step !== 'confirmed' && step !== 'failed';

  // Success modal
  const [successData, setSuccessData] = useState<TransactionSuccessData | null>(null);
  if (step === 'confirmed' && receipt && !successData) {
    setSuccessData({
      type: 'Borrow',
      amount: amountInput,
      asset: borrowAsset,
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

  const handleBorrow = useCallback(async () => {
    if (!isValidAmount) return;

    const borrowCallData = encodeFunctionData({
      abi: arcLendVaultAbi,
      functionName: 'borrow',
      args: [borrowAssetAddress, parsedAmount],
    });

    // Borrow doesn't need token approval
    await executeTransaction({
      contractAddress: ARCLEND_VAULT_ADDRESS,
      callData: borrowCallData,
    });
  }, [isValidAmount, parsedAmount, borrowAssetAddress, executeTransaction]);

  const handleReset = useCallback(() => {
    reset();
    setAmountInput('');
    setSuccessData(null);
  }, [reset]);

  // ─── Not Connected ────────────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Borrow USDC</h1>
          <p className="mt-2 text-[var(--muted-foreground)]">Connect your wallet to borrow assets.</p>
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
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Borrow</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Borrow USDC against your deposited collateral.
        </p>
      </div>

      {/* Position Overview */}
      <div className="card-base p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Collateral Value</p>
            <p className="mt-1 text-lg font-bold text-[var(--foreground)]">
              ${formatTokenAmount(collateralValueUsd, USDC_DECIMALS)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Borrow Power</p>
            <p className="mt-1 text-lg font-bold text-[var(--success)]">
              ${formatTokenAmount(availableToBorrow, USDC_DECIMALS)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Current Debt</p>
            <p className="mt-1 text-lg font-bold text-[var(--danger)]">
              ${formatTokenAmount(currentDebt, USDC_DECIMALS)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Health Factor</p>
            <p className={`mt-1 text-lg font-bold ${
              healthFactor == null ? 'text-[var(--muted-foreground)]'
                : isLiquidatable ? 'text-[var(--danger)]'
                : isWarning ? 'text-[var(--warning)]'
                : 'text-[var(--success)]'
            }`}>
              {healthFactor != null ? healthFactor.toFixed(2) : '∞'}
            </p>
          </div>
        </div>
        {suppliedBalance === 0n && (
          <p className="mt-3 text-xs text-[var(--warning)]">
            Supply assets first to enable borrowing.
          </p>
        )}
      </div>

      {/* Borrow Form */}
      <div className="card-base p-6">
        {/* Asset Selector */}
        <div>
          <label htmlFor="borrow-asset" className="block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Borrow Asset
          </label>
          <select
            id="borrow-asset"
            value={borrowAsset}
            onChange={(e) => { setBorrowAsset(e.target.value as 'USDC' | 'EURC'); setAmountInput(''); if (step !== 'idle') reset(); }}
            disabled={isProcessing}
            className="mt-2 block w-full rounded-xl border border-[var(--input-border)] bg-[var(--input-bg)] px-4 py-3 text-sm font-medium text-[var(--foreground)] transition-colors focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--input-focus)] disabled:opacity-50"
          >
            <option value="USDC">USDC</option>
            <option value="EURC">EURC</option>
          </select>
        </div>

        <div className="mt-5">
          <label htmlFor="borrow-amount" className="block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Amount
          </label>
          <div className="relative mt-2">
            <input
              id="borrow-amount"
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
              {borrowAsset}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p className="text-xs text-[var(--muted-foreground)]">
              Available: {formatTokenAmount(availableToBorrow, USDC_DECIMALS)} {borrowAsset}
            </p>
            {parsedAmount > 0n && projectedHealthFactor != null && (
              <p className={`text-xs font-medium ${projectedHealthFactor < 1.0 ? 'text-[var(--danger)]' : projectedHealthFactor < 1.2 ? 'text-[var(--warning)]' : 'text-[var(--muted-foreground)]'}`}>
                HF after: {projectedHealthFactor.toFixed(2)}
              </p>
            )}
          </div>
          {validationError && (
            <p className="mt-2 text-xs font-medium text-[var(--danger)]" role="alert">{validationError}</p>
          )}
        </div>

        {/* Transaction States */}
        <TransactionProgress
          step={step}
          stepOverrides={{
            executing: { label: 'Borrowing USDC', detail: 'Sign the borrow transaction in your wallet' },
          }}
        />

        {txError && step === 'failed' && <TransactionError error={txError} />}

        {/* Action Button */}
        <div className="mt-6">
          {(step === 'idle' || step === 'failed') && (
            <button
              type="button"
              onClick={handleBorrow}
              disabled={!isValidAmount}
              className="w-full rounded-xl bg-gradient-to-r from-[var(--accent)] to-purple-500 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:shadow-xl hover:shadow-[var(--accent)]/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {step === 'failed' ? 'Retry' : 'Borrow'}
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
