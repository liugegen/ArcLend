'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { encodeFunctionData } from 'viem';
import { useAccount, useReadContract } from 'wagmi';

import { useWallet } from '../../../contexts/WalletContext';
import { useCircleSDK } from '../../providers';
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

/** Minimal ERC-20 ABI for balance and allowance reads */
const erc20Abi = [
  {
    type: 'function',
    name: 'balanceOf',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'allowance',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'approve',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
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

  // ─── Local State ──────────────────────────────────────────────────────────

  const [selectedAsset, setSelectedAsset] = useState<AssetSymbol>('USDC');
  const [amountInput, setAmountInput] = useState('');
  const [needsApproval, setNeedsApproval] = useState(false);
  const [approvalPending, setApprovalPending] = useState(false);

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

  // ─── On-Chain Reads ───────────────────────────────────────────────────────

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

  // ─── Derived State ────────────────────────────────────────────────────────

  const parsedAmount = useMemo(() => parseTokenAmount(amountInput, asset.decimals), [amountInput, asset.decimals]);

  const validationError = useMemo(() => {
    if (!amountInput) return null;
    if (parsedAmount <= 0n) return 'Amount must be greater than 0';
    if (parsedAmount > balance) return 'Insufficient balance';
    return null;
  }, [amountInput, parsedAmount, balance]);

  const isValidAmount = parsedAmount > 0n && !validationError;

  // Check if ERC-20 approval is needed
  useEffect(() => {
    if (isValidAmount && allowance < parsedAmount) {
      setNeedsApproval(true);
    } else {
      setNeedsApproval(false);
    }
  }, [isValidAmount, allowance, parsedAmount]);

  // ─── Handlers ─────────────────────────────────────────────────────────────

  const handleAmountChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      // Allow only valid decimal input
      if (value === '' || /^\d*\.?\d{0,6}$/.test(value)) {
        setAmountInput(value);
        // Reset flow if user changes amount
        if (txStatus !== 'idle') {
          reset();
        }
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
      // Build approval callData
      const approveCallData = encodeFunctionData({
        abi: erc20Abi,
        functionName: 'approve',
        args: [ARCLEND_VAULT_ADDRESS, parsedAmount],
      });

      // Use the transaction flow for approval
      await estimateFee(approveCallData);
    } catch {
      // Error is handled by the transaction flow
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
    // Refetch allowance after successful tx (in case it was an approval)
    refetchAllowance();
  }, [execute, refetchAllowance]);

  const handleReset = useCallback(() => {
    reset();
    setAmountInput('');
  }, [reset]);

  // ─── Not Connected State ──────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Supply Assets</h1>
          <p className="mt-2 text-gray-600">Connect your wallet to supply assets.</p>
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
        <h1 className="mt-4 text-2xl font-bold text-gray-900">Supply</h1>
        <p className="mt-1 text-sm text-gray-500">
          Deposit assets into the lending pool to earn interest.
        </p>

        {/* Supply Form Card */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {/* Asset Selector */}
          <div>
            <label htmlFor="asset-select" className="block text-sm font-medium text-gray-700">
              Asset
            </label>
            <select
              id="asset-select"
              value={selectedAsset}
              onChange={handleAssetChange}
              disabled={txStatus !== 'idle' && txStatus !== 'failed'}
              className="mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            >
              {SUPPORTED_ASSETS.map((a) => (
                <option key={a.symbol} value={a.symbol}>
                  {a.symbol}
                </option>
              ))}
            </select>
          </div>

          {/* Amount Input */}
          <div className="mt-4">
            <label htmlFor="amount-input" className="block text-sm font-medium text-gray-700">
              Amount
            </label>
            <div className="relative mt-1">
              <input
                id="amount-input"
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
                aria-describedby="amount-balance"
                aria-invalid={!!validationError}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                {selectedAsset}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <p id="amount-balance" className="text-xs text-gray-500">
                Balance: {formatTokenAmount(balance, asset.decimals)} {selectedAsset}
              </p>
              <button
                type="button"
                onClick={() => setAmountInput(formatTokenAmount(balance, asset.decimals).replace(/,/g, ''))}
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                Max
              </button>
            </div>
            {validationError && (
              <p className="mt-1 text-xs text-red-600" role="alert">
                {validationError}
              </p>
            )}
          </div>

          {/* ERC-20 Approval Notice */}
          {needsApproval && txStatus === 'idle' && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm text-amber-800">
                You need to approve the vault to spend your {selectedAsset} before depositing.
              </p>
              <button
                type="button"
                onClick={handleApproval}
                disabled={approvalPending || !isValidAmount}
                className="mt-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {approvalPending ? 'Approving...' : `Approve ${selectedAsset}`}
              </button>
            </div>
          )}

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
          {txError && txStatus === 'failed' && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-sm text-red-800">{txError.message}</p>
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
                  Deposit confirmed!
                </span>
              </div>
              <button
                type="button"
                onClick={handleReset}
                className="mt-2 text-sm font-medium text-green-700 hover:text-green-800"
              >
                Make another deposit
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
                className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {txStatus === 'failed' ? 'Retry' : 'Estimate Fee & Supply'}
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
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
                >
                  Confirm Supply
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}
