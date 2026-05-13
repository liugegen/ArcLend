'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useAccount } from 'wagmi';
import { useCircleSDK } from '../../providers';
import {
  AmountBoundsError,
  TransferTimeoutError,
  TransferFailedError,
} from '@arclend/circle-sdk';
import type { TransferPhase, TransferStatus } from '@arclend/circle-sdk';

// ─── Constants ──────────────────────────────────────────────────────────────

const MIN_AMOUNT_USDC = 1_000_000n; // 1 USDC (6 decimals)
const MAX_AMOUNT_USDC = 10_000_000_000_000n; // 10,000,000 USDC (6 decimals)
const POLL_INTERVAL_MS = 5_000;
const TIMEOUT_MINUTES = 30;

/** Supported source chains for bridging. */
const SOURCE_CHAINS = [
  { id: 'arbitrum' as const, name: 'Arbitrum', chainId: 42161 },
] as const;

/** Ordered phases for the stepper display. */
const PHASE_ORDER: TransferPhase[] = [
  'initiated',
  'burning',
  'in-transit',
  'minting',
  'confirmed',
];

const PHASE_LABELS: Record<TransferPhase, string> = {
  initiated: 'Initiated',
  burning: 'Burning USDC',
  'in-transit': 'In Transit',
  minting: 'Minting USDC',
  confirmed: 'Confirmed',
  failed: 'Failed',
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseUsdcInput(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed || isNaN(Number(trimmed))) return null;
  const parts = trimmed.split('.');
  const whole = parts[0] ?? '0';
  const fraction = (parts[1] ?? '').padEnd(6, '0').slice(0, 6);
  try {
    return BigInt(whole) * 1_000_000n + BigInt(fraction);
  } catch {
    return null;
  }
}

function formatUsdc(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const fraction = amount % 1_000_000n;
  const fractionStr = fraction.toString().padStart(6, '0').slice(0, 2);
  return `${whole.toLocaleString()}.${fractionStr}`;
}

function formatEstimatedTime(estimatedCompletion: number): string {
  const now = Math.floor(Date.now() / 1000);
  const remaining = estimatedCompletion - now;
  if (remaining <= 0) return 'Any moment now';
  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;
  if (minutes > 0) return `~${minutes}m ${seconds}s remaining`;
  return `~${seconds}s remaining`;
}

// ─── Phase Stepper Component ────────────────────────────────────────────────

function PhaseStepper({ currentPhase }: { currentPhase: TransferPhase }) {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);

  return (
    <div className="flex items-center justify-between" role="list" aria-label="Transfer progress">
      {PHASE_ORDER.map((phase, index) => {
        let status: 'complete' | 'active' | 'pending';
        if (currentPhase === 'failed') {
          status = index <= currentIndex ? 'complete' : 'pending';
        } else if (index < currentIndex) {
          status = 'complete';
        } else if (index === currentIndex) {
          status = 'active';
        } else {
          status = 'pending';
        }

        return (
          <div key={phase} className="flex flex-1 items-center" role="listitem">
            <div className="flex flex-col items-center">
              {/* Status indicator */}
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${
                  status === 'complete'
                    ? 'border-green-500 bg-green-500 text-white'
                    : status === 'active'
                      ? 'border-blue-500 bg-blue-50 text-blue-600'
                      : 'border-gray-300 bg-white text-gray-400'
                }`}
                aria-label={`${PHASE_LABELS[phase]}: ${status}`}
              >
                {status === 'complete' ? (
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                ) : status === 'active' ? (
                  <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-blue-500" />
                ) : (
                  <span>{index + 1}</span>
                )}
              </div>
              {/* Label */}
              <span
                className={`mt-1.5 text-xs text-center ${
                  status === 'complete'
                    ? 'font-medium text-green-700'
                    : status === 'active'
                      ? 'font-medium text-blue-700'
                      : 'text-gray-400'
                }`}
              >
                {PHASE_LABELS[phase]}
              </span>
            </div>
            {/* Connector line */}
            {index < PHASE_ORDER.length - 1 && (
              <div
                className={`mx-2 h-0.5 flex-1 ${
                  index < currentIndex ? 'bg-green-500' : 'bg-gray-200'
                }`}
                aria-hidden="true"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Failure Notification Component ─────────────────────────────────────────

function FailureNotification({
  amount,
  sourceChain,
  reason,
  onDismiss,
}: {
  amount: bigint;
  sourceChain: string;
  reason: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className="rounded-lg border border-red-300 bg-red-50 p-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start gap-3">
        <svg
          className="h-5 w-5 flex-shrink-0 text-red-600"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
            clipRule="evenodd"
          />
        </svg>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-800">Transfer Failed</h3>
          <p className="mt-1 text-sm text-red-700">
            {reason}
          </p>
          <div className="mt-2 text-sm text-red-600">
            <p>Amount: {formatUsdc(amount)} USDC</p>
            <p>Source chain: {sourceChain.charAt(0).toUpperCase() + sourceChain.slice(1)}</p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="rounded p-1 text-red-500 hover:bg-red-100"
          aria-label="Dismiss notification"
        >
          <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Bridge Page ────────────────────────────────────────────────────────────

export default function BridgePage() {
  const { address, isConnected } = useAccount();
  const { cctp } = useCircleSDK();

  // Form state
  const [sourceChain, setSourceChain] = useState<'arbitrum'>('arbitrum');
  const [amountInput, setAmountInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  // Transfer state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transferStatus, setTransferStatus] = useState<TransferStatus | null>(null);
  const [currentPhase, setCurrentPhase] = useState<TransferPhase | null>(null);
  const [estimatedCompletion, setEstimatedCompletion] = useState<number | null>(null);
  const [estimatedTimeDisplay, setEstimatedTimeDisplay] = useState<string>('');

  // Error state
  const [failure, setFailure] = useState<{
    amount: bigint;
    sourceChain: string;
    reason: string;
  } | null>(null);

  // Polling ref
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeDisplayRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─── Cleanup on unmount ───────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (timeDisplayRef.current) clearInterval(timeDisplayRef.current);
    };
  }, []);

  // ─── Update estimated time display ────────────────────────────────────

  useEffect(() => {
    if (estimatedCompletion == null || currentPhase === 'confirmed' || currentPhase === 'failed') {
      if (timeDisplayRef.current) {
        clearInterval(timeDisplayRef.current);
        timeDisplayRef.current = null;
      }
      setEstimatedTimeDisplay('');
      return;
    }

    const update = () => setEstimatedTimeDisplay(formatEstimatedTime(estimatedCompletion));
    update();
    timeDisplayRef.current = setInterval(update, 1_000);

    return () => {
      if (timeDisplayRef.current) {
        clearInterval(timeDisplayRef.current);
        timeDisplayRef.current = null;
      }
    };
  }, [estimatedCompletion, currentPhase]);

  // ─── Validate amount input ────────────────────────────────────────────

  const validateAmount = useCallback((value: string): string | null => {
    if (!value.trim()) return null; // No error for empty input
    const parsed = parseUsdcInput(value);
    if (parsed === null) return 'Enter a valid number';
    if (parsed < MIN_AMOUNT_USDC) return `Minimum amount is 1 USDC`;
    if (parsed > MAX_AMOUNT_USDC) return `Maximum amount is 10,000,000 USDC`;
    return null;
  }, []);

  const handleAmountChange = (value: string) => {
    setAmountInput(value);
    setValidationError(validateAmount(value));
  };

  // ─── Start polling transfer status ────────────────────────────────────

  const startPolling = useCallback(
    (transferId: string, amount: bigint, chain: string) => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);

      pollIntervalRef.current = setInterval(async () => {
        try {
          const phase = await cctp.getTransferStatus(transferId);
          setCurrentPhase(phase);

          if (phase === 'confirmed') {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
          }
        } catch (error) {
          if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
          }

          if (error instanceof TransferTimeoutError) {
            setCurrentPhase('failed');
            setFailure({
              amount,
              sourceChain: chain,
              reason: `Transfer timed out after ${TIMEOUT_MINUTES} minutes. Your funds on ${chain.charAt(0).toUpperCase() + chain.slice(1)} have not been moved.`,
            });
          } else if (error instanceof TransferFailedError) {
            setCurrentPhase('failed');
            setFailure({
              amount,
              sourceChain: chain,
              reason: error.reason,
            });
          } else {
            setCurrentPhase('failed');
            setFailure({
              amount,
              sourceChain: chain,
              reason: 'An unexpected error occurred while checking transfer status.',
            });
          }
        }
      }, POLL_INTERVAL_MS);
    },
    [cctp],
  );

  // ─── Initiate bridge transfer ─────────────────────────────────────────

  const handleBridge = async () => {
    if (!address) return;

    const parsed = parseUsdcInput(amountInput);
    if (parsed === null) {
      setValidationError('Enter a valid amount');
      return;
    }

    const error = validateAmount(amountInput);
    if (error) {
      setValidationError(error);
      return;
    }

    setIsSubmitting(true);
    setFailure(null);
    setValidationError(null);

    try {
      const status = await cctp.initiateTransfer({
        sourceChain,
        amount: parsed,
        recipient: address,
      });

      setTransferStatus(status);
      setCurrentPhase(status.phase);
      setEstimatedCompletion(status.estimatedCompletion);

      // Start polling for status updates
      startPolling(status.transferId, parsed, sourceChain);
    } catch (error) {
      if (error instanceof AmountBoundsError) {
        setValidationError(
          `Amount must be between ${formatUsdc(error.min)} and ${formatUsdc(error.max)} USDC`,
        );
      } else if (error instanceof TransferFailedError) {
        setFailure({
          amount: parsed,
          sourceChain,
          reason: error.reason,
        });
      } else {
        setFailure({
          amount: parsed,
          sourceChain,
          reason: 'Failed to initiate transfer. Please try again.',
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── Reset form for new transfer ─────────────────────────────────────

  const handleReset = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setTransferStatus(null);
    setCurrentPhase(null);
    setEstimatedCompletion(null);
    setAmountInput('');
    setFailure(null);
    setValidationError(null);
  };

  // ─── Not Connected State ──────────────────────────────────────────────

  if (!isConnected) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Bridge USDC</h1>
          <p className="mt-2 text-gray-600">
            Connect your wallet to bridge USDC from other chains.
          </p>
        </div>
      </main>
    );
  }

  // ─── Determine if transfer is in progress ─────────────────────────────

  const isTransferActive =
    transferStatus != null &&
    currentPhase != null &&
    currentPhase !== 'confirmed' &&
    currentPhase !== 'failed';

  const isTransferComplete = currentPhase === 'confirmed';
  const isTransferFailed = currentPhase === 'failed';

  const parsedAmount = parseUsdcInput(amountInput);
  const canSubmit =
    !isSubmitting &&
    !isTransferActive &&
    parsedAmount !== null &&
    validationError === null &&
    amountInput.trim() !== '';

  // ─── Render ───────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-2xl">
        {/* Header with back link */}
        <div className="mb-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </Link>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">Bridge USDC</h1>
          <p className="mt-1 text-sm text-gray-500">
            Transfer USDC from supported chains to Arc Network via CCTP
          </p>
        </div>

        {/* Failure Notification */}
        {failure && (
          <div className="mb-6">
            <FailureNotification
              amount={failure.amount}
              sourceChain={failure.sourceChain}
              reason={failure.reason}
              onDismiss={() => setFailure(null)}
            />
          </div>
        )}

        {/* Bridge Form Card */}
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {/* Source Chain Selector */}
          <div className="mb-5">
            <label
              htmlFor="source-chain"
              className="block text-sm font-medium text-gray-700"
            >
              Source Chain
            </label>
            <select
              id="source-chain"
              value={sourceChain}
              onChange={(e) => setSourceChain(e.target.value as 'arbitrum')}
              disabled={isTransferActive}
              className="mt-1.5 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100"
            >
              {SOURCE_CHAINS.map((chain) => (
                <option key={chain.id} value={chain.id}>
                  {chain.name}
                </option>
              ))}
            </select>
          </div>

          {/* Amount Input */}
          <div className="mb-5">
            <label
              htmlFor="bridge-amount"
              className="block text-sm font-medium text-gray-700"
            >
              Amount (USDC)
            </label>
            <div className="relative mt-1.5">
              <input
                id="bridge-amount"
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amountInput}
                onChange={(e) => handleAmountChange(e.target.value)}
                disabled={isTransferActive}
                className={`block w-full rounded-lg border px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:bg-gray-100 ${
                  validationError
                    ? 'border-red-300 text-red-900 focus:border-red-500 focus:ring-red-500'
                    : 'border-gray-300 text-gray-900 focus:border-blue-500 focus:ring-blue-500'
                }`}
                aria-invalid={validationError ? 'true' : 'false'}
                aria-describedby={validationError ? 'amount-error' : undefined}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                USDC
              </span>
            </div>
            {validationError && (
              <p id="amount-error" className="mt-1.5 text-sm text-red-600" role="alert">
                {validationError}
              </p>
            )}
            <p className="mt-1.5 text-xs text-gray-400">
              Min: 1 USDC · Max: 10,000,000 USDC
            </p>
          </div>

          {/* Bridge Button */}
          {!isTransferActive && !isTransferComplete && (
            <button
              onClick={handleBridge}
              disabled={!canSubmit}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-500"
            >
              {isSubmitting ? (
                <span className="inline-flex items-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Initiating Transfer...
                </span>
              ) : (
                'Bridge USDC'
              )}
            </button>
          )}

          {/* Transfer Progress */}
          {(isTransferActive || isTransferComplete || isTransferFailed) && currentPhase && (
            <div className="mt-6 space-y-5">
              <div className="border-t border-gray-100 pt-5">
                <h2 className="text-sm font-semibold text-gray-900">Transfer Progress</h2>
                {transferStatus && (
                  <p className="mt-1 text-xs text-gray-500">
                    Transfer ID: {transferStatus.transferId}
                  </p>
                )}
              </div>

              {/* Phase Stepper */}
              <PhaseStepper currentPhase={currentPhase} />

              {/* Estimated Completion Time */}
              {isTransferActive && estimatedTimeDisplay && (
                <div className="flex items-center gap-2 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
                  <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{estimatedTimeDisplay}</span>
                </div>
              )}

              {/* Transfer Complete */}
              {isTransferComplete && (
                <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
                  <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span className="font-medium">
                    Transfer complete! {transferStatus && formatUsdc(transferStatus.amount)} USDC is now available on Arc Network.
                  </span>
                </div>
              )}

              {/* New Transfer Button */}
              {(isTransferComplete || isTransferFailed) && (
                <button
                  onClick={handleReset}
                  className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                >
                  Start New Transfer
                </button>
              )}
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900">How it works</h2>
          <ul className="mt-3 space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">1</span>
              <span>USDC is burned on the source chain (Arbitrum) via Circle CCTP</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">2</span>
              <span>Circle Gateway pre-credits your balance on Arc Network within ~30 seconds</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600">3</span>
              <span>Once CCTP finality is reached (~20 minutes), your deposit is confirmed</span>
            </li>
          </ul>
          <p className="mt-3 text-xs text-gray-400">
            Transfers that do not complete within {TIMEOUT_MINUTES} minutes will be automatically reverted.
          </p>
        </div>
      </div>
    </main>
  );
}
