'use client';

import Link from 'next/link';
import { useMarketData } from '../../../hooks/useMarketData';
import { useUserPosition } from '../../../hooks/useUserPosition';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTokenAmount(amount: bigint, decimals = 6): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 2);
  return `${whole.toLocaleString()}.${fractionStr}`;
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-white/[0.04] ${className}`} />;
}

// ─── Utilization Bar ────────────────────────────────────────────────────────

function UtilizationBar({ utilization }: { utilization: number }) {
  const color =
    utilization > 90
      ? 'bg-[var(--danger)]'
      : utilization > 70
        ? 'bg-[var(--warning)]'
        : 'bg-[var(--accent)]';

  return (
    <div className="flex items-center gap-2.5">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${Math.min(utilization, 100)}%` }}
        />
      </div>
      <span className="text-xs font-medium text-[var(--foreground)]">{utilization.toFixed(1)}%</span>
    </div>
  );
}

// ─── Markets Page ───────────────────────────────────────────────────────────

export default function MarketsPage() {
  const { markets, isLoading, isError, refetch } = useMarketData();
  const { usdcPoolState, eurcPoolState } = useUserPosition();

  const COLLATERAL_FACTOR = 80;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl lg:text-[2rem]">Markets</h1>
        <p className="mt-1.5 text-sm text-[var(--muted-foreground)] sm:text-base">
          Supply and borrow markets on ArcLend
        </p>
      </div>

      {/* Protocol Stats */}
      <div className="stagger-children grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card-base p-5 sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)] sm:text-[13px]">Total Value Locked</p>
          {isLoading ? (
            <Skeleton className="mt-3 h-8 w-28" />
          ) : (
            <p className="mt-3 text-2xl font-bold tracking-tight text-[var(--foreground)]">
              ${formatTokenAmount(markets.reduce((acc, m) => acc + m.totalSupplied, 0n))}
            </p>
          )}
        </div>
        <div className="card-base p-5 sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)] sm:text-[13px]">Total Borrowed</p>
          {isLoading ? (
            <Skeleton className="mt-3 h-8 w-28" />
          ) : (
            <p className="mt-3 text-2xl font-bold tracking-tight text-[var(--foreground)]">
              ${formatTokenAmount(markets.reduce((acc, m) => acc + m.totalBorrowed, 0n))}
            </p>
          )}
        </div>
        <div className="card-base p-5 sm:p-6">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)] sm:text-[13px]">Supported Assets</p>
          <p className="mt-3 text-2xl font-bold tracking-tight text-[var(--foreground)]">
            {markets.length || 2}
          </p>
        </div>
      </div>

      {/* Market Cards */}
      {isError ? (
        <div className="card-base flex flex-col items-center justify-center p-12 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--warning-muted)]">
            <svg className="h-7 w-7 text-[var(--warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <p className="mt-5 text-base font-medium text-[var(--foreground)]">Failed to load market data</p>
          <p className="mt-1.5 text-sm text-[var(--muted-foreground)]">Check your connection and try again</p>
          <button
            onClick={() => refetch()}
            className="mt-5 rounded-xl bg-[var(--accent)] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
          >
            Retry
          </button>
        </div>
      ) : isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-52 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : (
        <div className="space-y-4">
          {markets.map((market) => {
            const availableLiquidity = market.totalSupplied - market.totalBorrowed;

            return (
              <div key={market.asset} className="card-base overflow-hidden p-6 transition-shadow hover:shadow-lg">
                {/* Market Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent-muted)] to-[var(--accent)]/5 text-sm font-bold text-[var(--accent)] ring-1 ring-[var(--card-border)]">
                      {market.asset[0]}
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-[var(--foreground)]">{market.asset}</h3>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        {market.asset === 'USDC' ? 'USD Coin' : 'Euro Coin'}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Link
                      href="/dashboard/supply"
                      className="rounded-lg bg-[var(--success-muted)] px-3.5 py-1.5 text-xs font-semibold text-[var(--success)] transition-all hover:bg-[var(--success)]/20"
                    >
                      Supply
                    </Link>
                    <Link
                      href="/dashboard/borrow"
                      className="rounded-lg bg-[var(--accent-muted)] px-3.5 py-1.5 text-xs font-semibold text-[var(--accent)] transition-all hover:bg-[var(--accent)]/20"
                    >
                      Borrow
                    </Link>
                  </div>
                </div>

                {/* Market Stats Grid */}
                <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Supply APY</p>
                    <p className="mt-1.5 text-lg font-bold text-[var(--success)]">
                      {market.supplyAPY.toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Borrow APY</p>
                    <p className="mt-1.5 text-lg font-bold text-[var(--danger)]">
                      {market.borrowAPY.toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Utilization</p>
                    <div className="mt-2.5">
                      <UtilizationBar utilization={market.utilization} />
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Total Supplied</p>
                    <p className="mt-1.5 text-sm font-semibold text-[var(--foreground)]">
                      ${formatTokenAmount(market.totalSupplied)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Available</p>
                    <p className="mt-1.5 text-sm font-semibold text-[var(--foreground)]">
                      ${formatTokenAmount(availableLiquidity > 0n ? availableLiquidity : 0n)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted-foreground)]">Collateral Factor</p>
                    <p className="mt-1.5 text-sm font-semibold text-[var(--foreground)]">
                      {COLLATERAL_FACTOR}%
                    </p>
                  </div>
                </div>
              </div>
            );
          })}

          {markets.length === 0 && (
            <div className="card-base flex flex-col items-center justify-center p-12 text-center">
              <p className="text-sm text-[var(--muted-foreground)]">No markets available</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
