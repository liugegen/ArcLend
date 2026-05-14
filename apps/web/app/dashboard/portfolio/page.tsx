'use client';

import Link from 'next/link';
import { useWalletAccount } from '../../../hooks/useWalletAccount';
import { useUserPosition } from '../../../hooks/useUserPosition';
import { useHealthFactor } from '../../../hooks/useHealthFactor';
import { useMarketData } from '../../../hooks/useMarketData';
import { useUnifiedBalance } from '../../../hooks/useUnifiedBalance';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTokenAmount(amount: bigint, decimals = 6): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 2);
  return `${whole.toLocaleString()}.${fractionStr}`;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[var(--card-border)] ${className}`} />;
}

// ─── Health Factor Gauge ────────────────────────────────────────────────────

function HealthFactorGauge({ value }: { value: number | null }) {
  if (value == null) {
    return (
      <div className="flex flex-col items-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-[var(--card-border)]">
          <span className="text-xl font-bold text-[var(--muted-foreground)]">∞</span>
        </div>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">No debt</p>
      </div>
    );
  }

  const color =
    value < 1.0
      ? 'var(--danger)'
      : value <= 1.2
        ? 'var(--warning)'
        : 'var(--success)';

  const percentage = Math.min((value / 3) * 100, 100);

  return (
    <div className="flex flex-col items-center">
      <div
        className="flex h-24 w-24 items-center justify-center rounded-full border-4"
        style={{ borderColor: color }}
      >
        <span className="text-xl font-bold" style={{ color }}>
          {value.toFixed(2)}
        </span>
      </div>
      <p className="mt-2 text-xs text-[var(--muted-foreground)]">
        {value < 1.0 ? 'Liquidatable' : value <= 1.2 ? 'At Risk' : 'Healthy'}
      </p>
    </div>
  );
}

// ─── Portfolio Page ─────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { address } = useWalletAccount();
  const {
    position,
    usdcPoolState,
    eurcPoolState,
    isLoading: isPositionLoading,
  } = useUserPosition();
  const { healthFactor, isWarning, isLiquidatable } = useHealthFactor();
  const { markets } = useMarketData();
  const { unifiedBalance, arcBalance, preCreditedBalance } = useUnifiedBalance();

  // Compute balances
  let suppliedBalance = 0n;
  let borrowedBalance = 0n;

  if (position) {
    // collateralBalance = total supply value across ALL assets
    suppliedBalance = position.collateralBalance;

    if (position.borrowIndex > 0n && usdcPoolState) {
      borrowedBalance =
        (position.borrowPrincipal * usdcPoolState.borrowIndex) /
        position.borrowIndex;
    }
  }

  const usdcMarket = markets.find((m) => m.asset === 'USDC');
  const netWorth = suppliedBalance - borrowedBalance;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl lg:text-[2rem]">Portfolio</h1>
        <p className="mt-1.5 text-sm text-[var(--muted-foreground)] sm:text-base">
          Your complete position overview
        </p>
      </div>

      {/* Net Worth + Health Factor */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Net Worth */}
        <div className="card-base p-6 lg:col-span-2">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Net Worth</p>
          {isPositionLoading ? (
            <Skeleton className="mt-3 h-10 w-40" />
          ) : (
            <p className="mt-3 text-4xl font-bold tracking-tight text-[var(--foreground)]">
              ${formatTokenAmount(netWorth > 0n ? netWorth : 0n)}
            </p>
          )}
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-[var(--card-border)] pt-5">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Supplied</p>
              <p className="mt-1.5 text-sm font-bold text-[var(--success)]">
                ${formatTokenAmount(suppliedBalance)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Borrowed</p>
              <p className="mt-1.5 text-sm font-bold text-[var(--danger)]">
                ${formatTokenAmount(borrowedBalance)}
              </p>
            </div>
          </div>
        </div>

        {/* Health Factor */}
        <div className="card-base flex flex-col items-center justify-center p-6">
          <p className="mb-4 text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Health Factor</p>
          <HealthFactorGauge value={healthFactor} />
        </div>
      </div>

      {/* Active Positions */}
      <div className="card-base p-6">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Active Positions</h2>

        {isPositionLoading ? (
          <div className="mt-4 space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : suppliedBalance === 0n && borrowedBalance === 0n ? (
          <div className="mt-8 flex flex-col items-center text-center py-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-muted)]">
              <svg className="h-6 w-6 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
            <p className="mt-4 text-base font-medium text-[var(--foreground)]">No active positions</p>
            <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">
              Supply assets to start earning yield
            </p>
            <Link
              href="/dashboard/supply"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[var(--accent)] to-purple-500 px-6 py-3 text-sm font-medium text-white shadow-lg shadow-[var(--accent)]/20 hover:shadow-xl"
            >
              Supply Now
            </Link>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {/* Supply Position */}
            {suppliedBalance > 0n && (
              <div className="flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--success-muted)]">
                    <svg className="h-4 w-4 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">USDC Supply</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Earning {usdcMarket?.supplyAPY.toFixed(2) ?? '0.00'}% APY
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    ${formatTokenAmount(suppliedBalance)}
                  </p>
                  <Link
                    href="/dashboard/withdraw"
                    className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)]"
                  >
                    Withdraw
                  </Link>
                </div>
              </div>
            )}

            {/* Borrow Position */}
            {borrowedBalance > 0n && (
              <div className="flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--danger-muted)]">
                    <svg className="h-4 w-4 text-[var(--danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">USDC Borrow</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Paying {usdcMarket?.borrowAPY.toFixed(2) ?? '0.00'}% APY
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-[var(--danger)]">
                    -${formatTokenAmount(borrowedBalance)}
                  </p>
                  <Link
                    href="/dashboard/repay"
                    className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)]"
                  >
                    Repay
                  </Link>
                </div>
              </div>
            )}

            {/* Collateral Position — hidden for MVP (USDC-only model) */}
          </div>
        )}
      </div>

      {/* Wallet Balances */}
      <div className="card-base p-6">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">Wallet Balances</h2>
        <p className="text-[10px] text-[var(--muted-foreground)]">Available in your embedded wallet</p>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-muted)] text-xs font-bold text-[var(--accent)]">
                U
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--foreground)]">USDC</p>
                <p className="text-xs text-[var(--muted-foreground)]">Arc Network</p>
              </div>
            </div>
            <p className="text-sm font-semibold text-[var(--foreground)]">
              ${formatTokenAmount(arcBalance)}
            </p>
          </div>

          {preCreditedBalance > 0n && (
            <div className="flex items-center justify-between rounded-lg border border-[var(--card-border)] bg-[var(--background)] p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-muted)] text-xs font-bold text-[var(--accent)]">
                  U
                </div>
                <div>
                  <p className="text-sm font-medium text-[var(--foreground)]">USDC (Pending)</p>
                  <p className="text-xs text-[var(--muted-foreground)]">Cross-chain transfer</p>
                </div>
              </div>
              <p className="text-sm font-semibold text-[var(--muted-foreground)]">
                ${formatTokenAmount(preCreditedBalance)}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
