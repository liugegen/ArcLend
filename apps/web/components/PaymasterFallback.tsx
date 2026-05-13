'use client';

import { useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PaymasterFallbackProps {
  /** Whether the fallback banner is visible */
  isVisible: boolean;
  /** Callback when user chooses to pay with ARC token */
  onPayWithArc: () => void;
  /** Callback when user cancels the transaction */
  onCancel: () => void;
}

interface InsufficientFeeProps {
  /** Whether the insufficient fee notice is visible */
  isVisible: boolean;
  /** Minimum USDC required for the gas fee */
  minimumRequired: string;
  /** User's current USDC balance */
  currentBalance?: string;
  /** Callback to dismiss */
  onDismiss: () => void;
}

// ─── PaymasterFallback Component ────────────────────────────────────────────

/**
 * Fallback banner shown when Circle Paymaster is unavailable.
 * Offers the user the option to pay gas in ARC_Token directly or cancel.
 *
 * Requirement 8.3: When paymaster unavailable, show option to pay gas in ARC_Token.
 */
export function PaymasterFallback({ isVisible, onPayWithArc, onCancel }: PaymasterFallbackProps) {
  if (!isVisible) return null;

  return (
    <div
      role="alertdialog"
      aria-labelledby="paymaster-fallback-title"
      aria-describedby="paymaster-fallback-desc"
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4"
    >
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
        {/* Warning icon */}
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100">
          <svg
            className="h-6 w-6 text-amber-600"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
            />
          </svg>
        </div>

        {/* Title */}
        <h2
          id="paymaster-fallback-title"
          className="text-center text-lg font-semibold text-gray-900"
        >
          Gasless Transactions Unavailable
        </h2>

        {/* Description */}
        <p
          id="paymaster-fallback-desc"
          className="mt-2 text-center text-sm text-gray-600"
        >
          The gas sponsorship service is temporarily unavailable. You can proceed
          by paying the gas fee in ARC token directly from your wallet.
        </p>

        {/* Actions */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onPayWithArc}
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
          >
            Pay with ARC
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── InsufficientFeeNotice Component ────────────────────────────────────────

/**
 * Notice shown when user's USDC balance is insufficient to cover the gas fee.
 * Displays the minimum balance required.
 *
 * Requirement 8.6: Reject tx, show minimum balance required.
 */
export function InsufficientFeeNotice({
  isVisible,
  minimumRequired,
  currentBalance,
  onDismiss,
}: InsufficientFeeProps) {
  if (!isVisible) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="rounded-lg border border-red-200 bg-red-50 p-4"
    >
      <div className="flex items-start gap-3">
        {/* Error icon */}
        <div className="shrink-0">
          <svg
            className="h-5 w-5 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="2"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
            />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-red-800">
            Insufficient USDC for Gas Fee
          </h3>
          <p className="mt-1 text-sm text-red-700">
            A minimum of <span className="font-medium">{minimumRequired} USDC</span> is
            required to cover the gas fee for this transaction.
            {currentBalance && (
              <> Your current balance is <span className="font-medium">{currentBalance} USDC</span>.</>
            )}
          </p>
        </div>

        {/* Dismiss */}
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 rounded p-1 text-red-500 hover:text-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500"
          aria-label="Dismiss"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 16 16" stroke="currentColor" aria-hidden="true">
            <path d="M4 4l8 8m0-8l-8 8" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
