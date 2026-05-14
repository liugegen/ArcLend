'use client';

import { useCallback, useMemo, useState } from 'react';
import { encodeFunctionData } from 'viem';
import { useReadContract } from 'wagmi';

import { useWallet } from '../../../contexts/WalletContext';
import { useWalletAccount } from '../../../hooks/useWalletAccount';
import { useTransactionOrchestrator } from '../../../hooks/useTransactionOrchestrator';
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

const erc20BalanceOfAbi = [
  { type: 'function', name: 'balanceOf', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' },
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
  const { address, isConnected } = useWalletAccount();
  const { session } = useWallet();

  const [selectedAsset, setSelectedAsset] = useState<AssetSymbol>('USDC');
  const [amountInput, setAmountInput] = useState('');
  const [successData, setSuccessData] = useState<TransactionSuccessData | null>(null);

  const asset = useMemo(
    () => SUPPORTED_ASSETS.find((a) => a.symbol === selectedAsset)!,
    [selectedAsset],
  );

  const { step, error, receipt, executeTransaction, reset } = useTransactionOrchestrator();

  const { data: balanceData } = useReadContract({
    address: asset.address,
    abi: erc20BalanceOfAbi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: isConnected && !!address, refetchInterval: 15_000 },
  });

  const balance = (balanceData as bigint | undefined) ?? 0n;
  const parsedAmount = useMemo(() => parseTokenAmount(amountInput, asset.decimals), [amountInput, asset.decimals]);

  const validationError = useMemo(() => {
    if (!amountInput) return null;
    if (parsedAmount <= 0n) return 'Amount must be greater than 0';
    if (parsedAmount > balance) return 'Insufficient balance';
    return null;
  }, [amountInput, parsedAmount, balance]);

  const isValidAmount = parsedAmount > 0n && !validationError;
  const isProcessing = step !== 'idle' && step !== 'confirmed' && step !== 'failed';

  // Show success modal when transaction confirms
  const showSuccessModal = step === 'confirmed' && receipt && !successData;
  if (showSuccessModal && receipt) {
    setSuccessData({
      type: 'Supply',
      amount: amountInput,
      asset: selectedAsset,
      txHash: receipt.txHash,
      walletAddress: address,
      confirmedAt: receipt.confirmedAt,
    });
  }

  // ─── Handlers ───────────────────────────────────────────────────────────

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

  const handleSupply = useCallback(async () => {
    if (!isValidAmount) return;

    const depositCallData = encodeFunctionData({
      abi: arcLendVaultAbi,
      functionName: 'deposit',
      args: [asset.address, parsedAmount],
    });

    await executeTransaction({
      contractAddress: ARCLEND_VAULT_ADDRESS,
      callData: depositCallData,
      tokenAddress: asset.address,
      spenderAddress: ARCLEND_VAULT_ADDRESS,
      requiredAllowance: parsedAmount,
    });
  }, [isValidAmount, asset.address, parsedAmount, executeTransaction]);

  const handleCloseModal = useCallback(() => {
    setSuccessData(null);
    setAmountInput('');
    reset();
  }, [reset]);

  // ─── Not Connected ──────────────────────────────────────────────────────

  if (!isConnected && !session) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Supply Assets</h1>
          <p className="mt-2 text-sm text-[var(--muted-foreground)]">Connect your wallet to supply assets.</p>
        </div>
      </div>
    );
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      {/* Success Modal */}
      {successData && (
        <TransactionSuccessModal data={successData} onClose={handleCloseModal} />
      )}

      <div className="mx-auto max-w-lg space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Supply</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Deposit assets into the lending pool to earn interest.
          </p>
        </div>

        <div className="card-base p-6">
          {/* Asset Selector */}
          <div>
            <label htmlFor="asset-select" className="block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Asset</label>
            <select
              id="asset-select"
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

          {/* Amount Input */}
          <div className="mt-5">
            <label htmlFor="amount-input" className="block text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Amount</label>
            <div className="relative mt-2">
              <input
                id="amount-input"
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
                aria-describedby="amount-balance"
                aria-invalid={!!validationError}
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-[var(--muted-foreground)]">{selectedAsset}</span>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <p id="amount-balance" className="text-xs text-[var(--muted-foreground)]">
                Balance: {formatTokenAmount(balance, asset.decimals)} {selectedAsset}
              </p>
              <button
                type="button"
                onClick={() => setAmountInput(formatTokenAmount(balance, asset.decimals).replace(/,/g, ''))}
                disabled={isProcessing}
                className="rounded-md px-2 py-0.5 text-xs font-semibold text-[var(--accent)] transition-colors hover:bg-[var(--accent-muted)] disabled:opacity-50"
              >
                MAX
              </button>
            </div>
            {validationError && (
              <p className="mt-2 text-xs font-medium text-[var(--danger)]" role="alert">{validationError}</p>
            )}
          </div>

          {/* Transaction Progress */}
          <TransactionProgress
            step={step}
            stepOverrides={{
              executing: { label: 'Supplying assets', detail: 'Sign the deposit in your wallet' },
              confirming: { label: 'Confirming on-chain', detail: 'Waiting for blockchain confirmation...' },
            }}
          />

          {/* Error */}
          {error && step === 'failed' && <TransactionError error={error} />}

          {/* Action Button */}
          <div className="mt-6">
            {(step === 'idle' || step === 'failed' || step === 'confirmed') && (
              <button
                type="button"
                onClick={handleSupply}
                disabled={!isValidAmount}
                className="w-full rounded-xl bg-gradient-to-r from-[var(--accent)] to-purple-500 px-4 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:shadow-xl hover:shadow-[var(--accent)]/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                {step === 'failed' ? 'Retry' : 'Supply'}
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
