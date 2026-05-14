'use client';

import { useState } from 'react';
import { useWalletAccount } from '../../../hooks/useWalletAccount';
import { useWallet } from '../../../contexts/WalletContext';
import { USDC_ADDRESS, ARCLEND_VAULT_ADDRESS, PRICE_ORACLE_ADDRESS, INTEREST_RATE_MODEL_ADDRESS } from '../../../lib/contracts';

// ─── Settings Page ──────────────────────────────────────────────────────────

export default function SettingsPage() {
  const { address } = useWalletAccount();
  const { walletInfo, session, logout } = useWallet();
  const [showAdvanced, setShowAdvanced] = useState(false);

  const walletAddress = walletInfo?.address ?? address ?? '—';

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">Settings</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Manage your wallet and protocol preferences
        </p>
      </div>

      {/* Wallet Section */}
      <div className="card-base p-6">
        <h2 className="text-base font-semibold text-[var(--foreground)]">Wallet</h2>
        <p className="text-xs text-[var(--muted-foreground)]">Circle Embedded Wallet (ERC-4337)</p>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-4">
            <div>
              <p className="text-xs text-[var(--muted-foreground)]">Address</p>
              <p className="mt-0.5 font-mono text-sm text-[var(--foreground)]">{walletAddress}</p>
            </div>
            <button
              onClick={() => navigator.clipboard.writeText(walletAddress)}
              className="rounded-lg border border-[var(--card-border)] px-3 py-1.5 text-xs font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              Copy
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-4">
            <div>
              <p className="text-xs text-[var(--muted-foreground)]">Network</p>
              <p className="mt-0.5 text-sm text-[var(--foreground)]">Arc Testnet (Chain ID: 5042002)</p>
            </div>
            <span className="inline-flex items-center rounded-full bg-[var(--success-muted)] px-2.5 py-0.5 text-xs font-medium text-[var(--success)]">
              Connected
            </span>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-4">
            <div>
              <p className="text-xs text-[var(--muted-foreground)]">Wallet Type</p>
              <p className="mt-0.5 text-sm text-[var(--foreground)]">Smart Contract Account (ERC-4337)</p>
            </div>
            <span className="inline-flex items-center rounded-full bg-[var(--accent-muted)] px-2.5 py-0.5 text-xs font-medium text-[var(--accent)]">
              Gasless
            </span>
          </div>
        </div>

        <button
          onClick={logout}
          className="mt-4 w-full rounded-xl border border-[var(--danger)]/30 px-4 py-2.5 text-sm font-medium text-[var(--danger)] transition-all hover:bg-[var(--danger-muted)]"
        >
          Disconnect Wallet
        </button>
      </div>

      {/* Gas & Transactions */}
      <div className="card-base p-6">
        <h2 className="text-base font-semibold text-[var(--foreground)]">Gas & Transactions</h2>
        <p className="text-xs text-[var(--muted-foreground)]">How your transactions are processed</p>

        <div className="mt-4 space-y-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--success-muted)]">
              <svg className="h-4 w-4 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">Circle Paymaster (Primary)</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                Gas fees are paid in USDC via Circle's Paymaster service. No native token needed.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--warning-muted)]">
              <svg className="h-4 w-4 text-[var(--warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">ARC Token Fallback</p>
              <p className="text-xs text-[var(--muted-foreground)]">
                If the Paymaster is unavailable, you can pay gas directly in ARC token.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Protocol Info */}
      <div className="card-base p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-[var(--foreground)]">Protocol</h2>
            <p className="text-xs text-[var(--muted-foreground)]">ArcLend contract addresses</p>
          </div>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-xs font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
          >
            {showAdvanced ? 'Hide' : 'Show'}
          </button>
        </div>

        {showAdvanced && (
          <div className="mt-4 space-y-2">
            <ContractRow label="ArcLend Vault" address={ARCLEND_VAULT_ADDRESS} />
            <ContractRow label="Price Oracle" address={PRICE_ORACLE_ADDRESS} />
            <ContractRow label="Interest Rate Model" address={INTEREST_RATE_MODEL_ADDRESS} />
            <ContractRow label="USDC" address={USDC_ADDRESS} />
          </div>
        )}
      </div>

      {/* About */}
      <div className="card-base p-6">
        <h2 className="text-base font-semibold text-[var(--foreground)]">About ArcLend</h2>
        <p className="mt-2 text-sm text-[var(--muted-foreground)] leading-relaxed">
          ArcLend is a lending and borrowing protocol built on Arc Network. It uses Circle Embedded
          Wallets for seamless onboarding — no seed phrases, no gas tokens. Supply USDC/EURC to earn
          yield, borrow against your position, and manage your portfolio with gasless transactions.
        </p>
        <div className="mt-4 flex gap-4 text-xs text-[var(--muted-foreground)]">
          <span>Version 0.1.0</span>
          <span>•</span>
          <span>Arc Testnet</span>
          <span>•</span>
          <span>Chain ID: 5042002</span>
        </div>
      </div>
    </div>
  );
}

// ─── Contract Row Component ─────────────────────────────────────────────────

function ContractRow({ label, address }: { label: string; address: string }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5">
      <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
      <span className="font-mono text-xs text-[var(--foreground)]">
        {address.slice(0, 6)}...{address.slice(-4)}
      </span>
    </div>
  );
}
