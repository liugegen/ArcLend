'use client';

/**
 * TransactionStatus — Shared transaction progress and success UI.
 *
 * Reusable across Supply, Borrow, Repay, Withdraw pages.
 * Shows step progress, success confirmation with explorer link, and errors.
 */

import type { OrchestratorStep, OrchestratorError } from '../hooks/useTransactionOrchestrator';

// ─── Arc Explorer ───────────────────────────────────────────────────────────

const ARC_EXPLORER_URL = 'https://testnet.arcscan.app';

// ─── Step Progress ──────────────────────────────────────────────────────────

interface StepConfig {
  label: string;
  detail: string;
}

const DEFAULT_STEPS: Record<string, StepConfig> = {
  'checking-allowance': { label: 'Checking approval', detail: 'Verifying token allowance...' },
  'approving': { label: 'Approving token', detail: 'Sign the approval in your wallet' },
  'waiting-approval': { label: 'Approval confirmed', detail: 'Proceeding to transaction...' },
  'executing': { label: 'Executing transaction', detail: 'Sign the transaction in your wallet' },
  'confirming': { label: 'Confirming', detail: 'Transaction submitted, finalizing...' },
};

interface TransactionProgressProps {
  step: OrchestratorStep;
  /** Override step labels for specific actions (e.g., "Supplying assets") */
  stepOverrides?: Partial<Record<string, StepConfig>>;
}

export function TransactionProgress({ step, stepOverrides }: TransactionProgressProps) {
  const steps = { ...DEFAULT_STEPS, ...stepOverrides };
  const current = steps[step];
  if (!current) return null;

  return (
    <div className="mt-5 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-muted)] p-4">
      <div className="flex items-center gap-3">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
        <div>
          <p className="text-sm font-medium text-[var(--accent)]">{current.label}</p>
          <p className="text-[11px] text-[var(--muted-foreground)]">{current.detail}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Transaction Success ────────────────────────────────────────────────────

interface TransactionSuccessProps {
  /** Action description (e.g., "Deposit confirmed!", "Withdrawal complete!") */
  message: string;
  /** Amount transacted */
  amount?: string;
  /** Asset symbol */
  asset?: string;
  /** Transaction hash for explorer link */
  txHash?: string;
  /** Callback to reset and allow another transaction */
  onReset: () => void;
  /** Reset button label */
  resetLabel?: string;
}

export function TransactionSuccess({
  message,
  amount,
  asset,
  txHash,
  onReset,
  resetLabel = 'Make another transaction →',
}: TransactionSuccessProps) {
  return (
    <div className="mt-5 rounded-xl border border-[var(--success)]/30 bg-[var(--success-muted)] p-4">
      <div className="flex items-center gap-3">
        <svg className="h-5 w-5 text-[var(--success)]" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-[var(--success)]">{message}</p>
          {amount && asset && (
            <p className="text-xs text-[var(--muted-foreground)]">
              {amount} {asset}
            </p>
          )}
        </div>
      </div>

      {txHash && (
        <div className="mt-3 flex items-center gap-2">
          <a
            href={`${ARC_EXPLORER_URL}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-muted)]"
          >
            View on Explorer
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      )}

      <button
        type="button"
        onClick={onReset}
        className="mt-3 text-sm font-medium text-[var(--success)] hover:opacity-80"
      >
        {resetLabel}
      </button>
    </div>
  );
}

// ─── Transaction Error ──────────────────────────────────────────────────────

interface TransactionErrorProps {
  error: OrchestratorError;
}

export function TransactionError({ error }: TransactionErrorProps) {
  return (
    <div className="mt-5 rounded-xl border border-[var(--danger)]/30 bg-[var(--danger-muted)] p-4">
      <p className="text-sm text-[var(--danger)]">{error.message}</p>
      {error.isSessionExpired && (
        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
          Your session has expired. Please refresh and log in again.
        </p>
      )}
    </div>
  );
}
