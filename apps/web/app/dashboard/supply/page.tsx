'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { encodeFunctionData } from 'viem';
import { useAccount, useReadContract } from 'wagmi';

import { useWallet } from '../../../contexts/WalletContext';
import { useTransactionFlow } from '../../../hooks/useTransactionFlow';
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

const erc20Abi = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'allowance', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
  { type: 'function', name: 'approve', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }], stateMutability: 'nonpayable' },
] as const;

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

// ─── Supply Page ────────────────────────────────────────────────────────────

export default function SupplyPage() {
  const { address, isConnected } = useAccount();
  const { session } = useWallet();

  const [selectedAsset, setSelectedAsset] = useState<AssetSymbol>('USDC');
  const [amountInput, setAmountInput] = useState('');
  const [needsApproval, setNeedsApproval] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);

  const asset = useMemo(
    () => SUPPORTED_ASSETS.find((a) => a.symbol === selectedAsset)!,
    [selectedAsset],
  );

  const {
    status: txStatus,
    feeEstimate,
    error: txError,
    paymasterUnavailable,
    estimateFee,
    execute,
    reset,
  } = useTransactionFlow();

  const { data: balanceData } = useReadContract({
    address: asset.address,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: isConnected && !!address },
  });

  const { data: allowanceData, refetch: refetchAllowance } = useReadContract({
    address: asset.address,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address ? [address, ARCLEND_VAULT_ADDRESS] : undefined,
    query: { enabled: isConnected && !!address },
  });

  const balance = (balanceData as bigint | undefined) ?? 0n;
  const allowance = (allowanceData as bigint | undefined) ?? 0n;

  const parsedAmount = useMemo(() => parseTokenAmount(amountInput, asset.decimals), [amountInput, asset.decimals]);

  const validationError = useMemo(() => {
    if (!amountInput) return null;
    if (parsedAmount <= 0n) return 'Amount must be greater than 0';
    if (parsedAmount > balance) return 'Insufficient balance';
    return null;
  }, [amountInput, parsedAmount, balance]);

  const isValidAmount = parsedAmount > 0n && !validationError;

  useEffect(() => {
    setNeedsApproval(isValidAmount && allowance < parsedAmount);
  }, [isValidAmount, allowance, parsedAmount]);

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

  const handleApproval = useCallback(async () => {
    if (!isValidAmount) return;
    setApprovalPending(true);
    try {
      const approveCallData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [ARCLEND_VAULT_ADDRESS, parsedAmount],
      });
      await estimateFee(approveCallData);
    } catch {
      // handled by flow
    } finally {
      setApprovalPending(false);
    }
  }, [isValidAmount, parsedAmount, estimateFee]);

  const handleEstimateFee = useCallback(async () => {
    if (!isValidAmount) return;
    const depositCallData = encodeFunctionData({
      abi: arcLendVaultAbi,
      functionName: 'deposit',
      args: [asset.address, parsedAmount],
    });
    await estimateFee(depositCallData);
  }, [isValidAmount, asset.address, parsedAmount, estimateFee]);

  const handleConfirm = useCallback(async () => {
    await execute();
    refetchAllowance();
  }, [execute, refetchAllowance]);

  const handleReset = useCallback(() => {
    reset();
    setAmountInput('');
  }, [reset]);

  if (!isConnected) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Supply Assets</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">Connect your wallet to supply assets.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Supply</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Deposit assets into the lending pool to earn interest.
        </p>
      </div>

      {/* Supply Form Card */}
      <div className="card-base p-6">
        {/* Asset Selector */}
        <div>
          <label htmlFor="asset-select" className="block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Asset
          </label>
          <select
            id="asset-select"
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
          <label htmlFor="amount-input" className="block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Amount
          </label>
          <div className="relative mt-2">
            <input
              id="amount-input"
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
              aria-describedby="amount-balance"
              aria-invalid={!!validationError}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-[var(--muted-foreground)]">
              {selectedAsset}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between">
            <p id="amount-balance" className="text-xs text-[var(--muted-foreground)]">
              Balance: {formatTokenAmount(balance, asset.decimals)} {selectedAsset}
            </p>
            <button
              type="button"
              onClick={() => setAmountInput(formatTokenAmount(balance, asset.decimals).replace(/,/g, ''))}
              className="rounded-md px-2 py-0.5 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-muted)]"
            >
              MAX
            </button>
          </div>
          {validationError && (
            <p className="mt-2 text-xs font-medium text-[var(--danger)]" role="alert">{validationError}</p>
          )}
        </div>

        {/* Approval Notice */}
        {needsApproval && txStatus === 'idle' && (
          <div className="mt-5 rounded-xl border border-[var(--warning)]/30 bg-[var(--warning-muted)] p-4">
            <p className="text-sm text-[var(--warning)]">
              Approve the vault to spend your {selectedAsset} before depositing.
            </p>
            <button
              type="button"
              onClick={handleApproval}
              disabled={approvalPending || !isValidAmount}
              className="mt-3 rounded-xl bg-[var(--warning)] px-4 py-2 text-sm font-semibold text-black transition-opacity hover:opacity-80 disabled:opacity-50"
            >
              {approvalPending ? 'Approving...' : `Approve ${selectedAsset}`}
            </button>
          </div>
        )}

        {/* Fee Estimate */}
        {feeEstimate && (txStatus === 'confirming' || txStatus === 'signing' || txStatus === 'submitting' || txStatus === 'pending') && (
          <div className="mt-5 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--muted-foreground)]">Gas Fee</span>
              <span className="font-semibold text-[var(--foreground)]">
                {formatTokenAmount(feeEstimate.usdcFee, 6)} USDC
              </span>
            </div>
            <p className="mt-1 text-[10px] text-[var(--muted-foreground)]">
              Sponsored by Circle Paymaster — no ARC token needed
            </p>
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
                {txStatus === 'signing' && 'Signing transaction...'}
                {txStatus === 'submitting' && 'Submitting transaction...'}
                {txStatus === 'pending' && 'Waiting for confirmation...'}
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
              <span className="text-sm font-semibold text-[var(--success)]">Deposit confirmed!</span>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="mt-3 text-sm font-medium text-[var(--success)] hover:opacity-80"
            >
              Make another deposit →
            </button>
          </div>
        )}

        {/* Action Buttons */}
        <div className="mt-6">
          {txStatus === 'idle' || txStatus === 'failed' ? (
            <button
              type="button"
              onClick={handleEstimateFee}
              disabled={!isValidAmount || needsApproval}
              className="w-full rounded-xl bg-gradient-to-r from-[var(--accent)] to-purple-500 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:shadow-xl hover:shadow-[var(--accent)]/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {txStatus === 'failed' ? 'Retry' : 'Supply'}
            </button>
          ) : txStatus === 'estimating' ? (
            <button disabled className="w-full rounded-xl bg-[var(--accent)] px-4 py-3.5 text-sm font-semibold text-white opacity-60">
              Estimating fee...
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
