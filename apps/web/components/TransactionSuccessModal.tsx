'use client';

/**
 * TransactionSuccessModal — Full-screen success confirmation overlay.
 *
 * Displays after every confirmed transaction with:
 * - Success animation
 * - Transaction type + amount + asset
 * - Real tx hash (truncated + copyable)
 * - "View on Arc Explorer" button (https://testnet.arcscan.app/tx/{hash})
 * - Timestamp
 * - Close/Done button
 */

import { useCallback, useState } from 'react';

// ─── Constants ──────────────────────────────────────────────────────────────

const ARC_EXPLORER_BASE = 'https://testnet.arcscan.app';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface TransactionSuccessData {
  /** Transaction type label */
  type: 'Supply' | 'Withdraw' | 'Borrow' | 'Repay' | 'Approve';
  /** Amount transacted */
  amount: string;
  /** Asset symbol */
  asset: string;
  /** On-chain transaction hash */
  txHash: string;
  /** Wallet address */
  walletAddress?: string;
  /** Confirmation timestamp */
  confirmedAt: number;
}

interface TransactionSuccessModalProps {
  data: TransactionSuccessData;
  onClose: () => void;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function truncateHash(hash: string): string {
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── Component ──────────────────────────────────────────────────────────────

export function TransactionSuccessModal({ data, onClose }: TransactionSuccessModalProps) {
  const [copied, setCopied] = useState(false);

  const explorerUrl = `${ARC_EXPLORER_BASE}/tx/${data.txHash}`;
  const isRealHash = data.txHash.startsWith('0x') && data.txHash.length === 66;

  const handleCopyHash = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(data.txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const el = document.createElement('textarea');
      el.value = data.txHash;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [data.txHash]);

  const handleViewExplorer = useCallback(() => {
    window.open(explorerUrl, '_blank', 'noopener,noreferrer');
  }, [explorerUrl]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Transaction confirmed">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-sm rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-6 shadow-2xl">
        {/* Success Icon */}
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--success-muted)]">
            <svg className="h-8 w-8 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 className="mt-4 text-center text-lg font-bold text-[var(--foreground)]">
          {data.type} Confirmed
        </h2>

        {/* Amount */}
        <p className="mt-1 text-center text-2xl font-bold text-[var(--foreground)]">
          {data.amount} {data.asset}
        </p>

        {/* Details */}
        <div className="mt-5 space-y-3 rounded-xl border border-[var(--card-border)] bg-[var(--background)] p-4">
          {/* Status */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--muted-foreground)]">Status</span>
            <span className="flex items-center gap-1.5 font-medium text-[var(--success)]">
              <span className="h-2 w-2 rounded-full bg-[var(--success)]" />
              Confirmed
            </span>
          </div>

          {/* Tx Hash */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--muted-foreground)]">Tx Hash</span>
            <button
              onClick={handleCopyHash}
              className="flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono text-xs text-[var(--foreground)] transition-colors hover:bg-[var(--accent-muted)]"
              title="Copy transaction hash"
            >
              {truncateHash(data.txHash)}
              {copied ? (
                <svg className="h-3.5 w-3.5 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              ) : (
                <svg className="h-3.5 w-3.5 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
              )}
            </button>
          </div>

          {/* Network */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--muted-foreground)]">Network</span>
            <span className="font-medium text-[var(--foreground)]">Arc Testnet</span>
          </div>

          {/* Time */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-[var(--muted-foreground)]">Time</span>
            <span className="font-medium text-[var(--foreground)]">{formatTimestamp(data.confirmedAt)}</span>
          </div>
        </div>

        {/* Explorer Button */}
        {isRealHash && (
          <button
            onClick={handleViewExplorer}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--accent)]/30 bg-[var(--accent-muted)] px-4 py-3 text-sm font-semibold text-[var(--accent)] transition-all hover:bg-[var(--accent)]/20"
          >
            View on Arc Explorer
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>
        )}

        {/* Done Button */}
        <button
          onClick={onClose}
          className="mt-3 w-full rounded-xl bg-gradient-to-r from-[var(--accent)] to-purple-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--accent)]/20 transition-all hover:shadow-xl"
        >
          Done
        </button>
      </div>
    </div>
  );
}
