'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useWalletAccount } from '../../hooks/useWalletAccount';
import { useUserPosition } from '../../hooks/useUserPosition';
import { useMarketData } from '../../hooks/useMarketData';
import { useHealthFactor } from '../../hooks/useHealthFactor';
import { useUnifiedBalance } from '../../hooks/useUnifiedBalance';

// ─── Helper: format bigint token amounts (6 decimals for USDC/EURC) ─────────

function formatTokenAmount(amount: bigint, decimals = 6): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const fractionStr = fraction.toString().padStart(decimals, '0').slice(0, 2);
  return `${whole.toLocaleString()}.${fractionStr}`;
}

// ─── Skeleton Loader ────────────────────────────────────────────────────────

function Skeleton({ className = '' }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-white/[0.04] ${className}`} />
  );
}

// ─── Data Unavailable Indicator ─────────────────────────────────────────────

function DataUnavailable({
  onRetry,
}: {
  onRetry: () => void;
  retryIn?: number | null;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-[var(--warning-muted)] px-3 py-2 text-xs text-[var(--warning)]">
      <svg className="h-3.5 w-3.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
        <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
      </svg>
      <span>Unable to load</span>
      <button
        onClick={onRetry}
        className="ml-auto rounded-md bg-[var(--warning)] px-2 py-0.5 text-[10px] font-semibold text-black hover:opacity-80"
      >
        Retry
      </button>
    </div>
  );
}

// ─── Auto-Retry Hook ────────────────────────────────────────────────────────

function useAutoRetry(isError: boolean, refetch: () => void) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isError) {
      timerRef.current = setInterval(() => {
        refetch();
      }, 10_000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isError, refetch]);
}

// ─── Health Factor Ring ─────────────────────────────────────────────────────

function HealthFactorRing({ value, isWarning, isLiquidatable }: {
  value: number | null;
  isWarning: boolean;
  isLiquidatable: boolean;
}) {
  const color = value == null
    ? 'var(--muted-foreground)'
    : isLiquidatable
      ? 'var(--danger)'
      : isWarning
        ? 'var(--warning)'
        : 'var(--success)';

  const percentage = value == null ? 100 : Math.min((value / 3) * 100, 100);
  const circumference = 2 * Math.PI * 36;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative flex h-20 w-20 items-center justify-center">
      <svg className="absolute h-full w-full -rotate-90" viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r="36" fill="none" stroke="var(--card-border)" strokeWidth="4" />
        <circle
          cx="40" cy="40" r="36" fill="none"
          stroke={color}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className="transition-all duration-700 ease-out"
        />
      </svg>
      <span className="text-lg font-bold" style={{ color }}>
        {value != null ? value.toFixed(2) : '∞'}
      </span>
    </div>
  );
}

// ─── Dashboard Page ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { isConnected } = useWalletAccount();

  const {
    position,
    usdcPoolState,
    isLoading: isPositionLoading,
    isError: isPositionError,
    refetch: refetchPosition,
  } = useUserPosition();

  const {
    markets,
    isLoading: isMarketLoading,
    isError: isMarketError,
    refetch: refetchMarket,
  } = useMarketData();

  const {
    healthFactor,
    isWarning,
    isLiquidatable,
    isLoading: isHFLoading,
    isError: isHFError,
    refetch: refetchHF,
  } = useHealthFactor();

  const {
    unifiedBalance,
    arcBalance,
    isLoading: isBalanceLoading,
    isError: isBalanceError,
    refetch: refetchBalance,
  } = useUnifiedBalance();

  useAutoRetry(isPositionError, refetchPosition);
  useAutoRetry(isMarketError, refetchMarket);
  useAutoRetry(isHFError, refetchHF);
  useAutoRetry(isBalanceError, refetchBalance);

  // ─── Compute Supplied/Borrowed Balances ─────────────────────────────────

  let suppliedBalance = 0n;
  let borrowedBalance = 0n;

  if (position) {
    // collateralBalance = total supply value across ALL assets (from contract)
    suppliedBalance = position.collateralBalance;

    if (position.borrowIndex > 0n && usdcPoolState) {
      borrowedBalance =
        (position.borrowPrincipal * usdcPoolState.borrowIndex) /
        position.borrowIndex;
    }
  }

  // ─── Compute Net APY ────────────────────────────────────────────────────

  const usdcMarket = markets.find((m) => m.asset === 'USDC');

  let netAPY = 0;
  if (suppliedBalance > 0n || borrowedBalance > 0n) {
    const supplyEarnings = usdcMarket
      ? Number(suppliedBalance) * (usdcMarket.supplyAPY / 100)
      : 0;
    const borrowCost = usdcMarket
      ? Number(borrowedBalance) * (usdcMarket.borrowAPY / 100)
      : 0;
    if (Number(suppliedBalance || 1n) > 0) {
      netAPY = ((supplyEarnings - borrowCost) / Number(suppliedBalance || 1n)) * 100;
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl lg:text-[2rem]">
          Dashboard
        </h1>
        <p className="text-sm text-[var(--muted-foreground)] sm:text-base">
          Your ArcLend positions and market overview
        </p>
      </div>

      {/* Health Factor Warning Banner */}
      {isWarning && healthFactor != null && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-5 py-4 ${
            isLiquidatable
              ? 'border-[var(--danger)]/30 bg-[var(--danger-muted)]'
              : 'border-[var(--warning)]/30 bg-[var(--warning-muted)]'
          }`}
          role="alert"
        >
          <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
            isLiquidatable ? 'bg-[var(--danger)]/20' : 'bg-[var(--warning)]/20'
          }`}>
            <svg className={`h-4 w-4 ${isLiquidatable ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
              <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="flex-1">
            <p className={`text-sm font-semibold ${isLiquidatable ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`}>
              {isLiquidatable
                ? 'Liquidation Risk — Your position may be liquidated'
                : 'Warning — Liquidation risk is elevated'}
            </p>
          </div>
          <span className={`font-mono text-sm font-bold ${isLiquidatable ? 'text-[var(--danger)]' : 'text-[var(--warning)]'}`}>
            HF: {healthFactor.toFixed(4)}
          </span>
        </div>
      )}

      {/* KPI Cards Grid */}
      <div className="stagger-children grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Total Supplied */}
        <div className="card-base p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)] sm:text-[13px]">
              Total Supplied
            </p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--success-muted)]">
              <svg className="h-4.5 w-4.5 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </div>
          </div>
          {isPositionError ? (
            <div className="mt-3"><DataUnavailable onRetry={refetchPosition} /></div>
          ) : isPositionLoading ? (
            <Skeleton className="mt-4 h-9 w-28" />
          ) : (
            <p className="mt-4 text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-[1.75rem]">
              ${formatTokenAmount(suppliedBalance)}
            </p>
          )}
        </div>

        {/* Total Borrowed */}
        <div className="card-base p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)] sm:text-[13px]">
              Total Borrowed
            </p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--danger-muted)]">
              <svg className="h-4.5 w-4.5 text-[var(--danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
              </svg>
            </div>
          </div>
          {isPositionError ? (
            <div className="mt-3"><DataUnavailable onRetry={refetchPosition} /></div>
          ) : isPositionLoading ? (
            <Skeleton className="mt-4 h-9 w-28" />
          ) : (
            <p className="mt-4 text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-[1.75rem]">
              ${formatTokenAmount(borrowedBalance)}
            </p>
          )}
        </div>

        {/* Net APY */}
        <div className="card-base p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)] sm:text-[13px]">
              Net APY
            </p>
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-muted)]">
              <svg className="h-4.5 w-4.5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
              </svg>
            </div>
          </div>
          {isMarketError ? (
            <div className="mt-3"><DataUnavailable onRetry={refetchMarket} /></div>
          ) : isMarketLoading ? (
            <Skeleton className="mt-4 h-9 w-28" />
          ) : (
            <p className={`mt-4 text-2xl font-bold tracking-tight sm:text-[1.75rem] ${netAPY >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
              {netAPY >= 0 ? '+' : ''}{netAPY.toFixed(2)}%
            </p>
          )}
        </div>

        {/* Health Factor */}
        <div className="card-base p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)] sm:text-[13px]">
              Health Factor
            </p>
            {!isHFLoading && !isHFError && (
              <HealthFactorRing value={healthFactor} isWarning={isWarning} isLiquidatable={isLiquidatable} />
            )}
          </div>
          {isHFError ? (
            <div className="mt-3"><DataUnavailable onRetry={refetchHF} /></div>
          ) : isHFLoading ? (
            <Skeleton className="mt-4 h-9 w-28" />
          ) : (
            <p className={`mt-4 text-2xl font-bold tracking-tight sm:text-[1.75rem] ${
              healthFactor == null
                ? 'text-[var(--muted-foreground)]'
                : isLiquidatable
                  ? 'text-[var(--danger)]'
                  : isWarning
                    ? 'text-[var(--warning)]'
                    : 'text-[var(--success)]'
            }`}>
              {healthFactor != null ? healthFactor.toFixed(4) : '∞'}
            </p>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        {[
          { href: '/dashboard/supply', label: 'Supply', icon: 'M12 4.5v15m7.5-7.5h-15', color: 'var(--success)' },
          { href: '/dashboard/borrow', label: 'Borrow', icon: 'M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3', color: 'var(--accent)' },
          { href: '/dashboard/repay', label: 'Repay', icon: 'M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18', color: 'var(--warning)' },
        ].map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="group flex items-center justify-center gap-2.5 rounded-xl border border-[var(--card-border)] bg-[var(--card)] px-4 py-4 text-sm font-medium text-[var(--foreground)] transition-all duration-200 hover:border-[var(--card-border-hover)] hover:bg-[var(--card-hover)] hover:shadow-md sm:py-3.5"
          >
            <svg className="h-4.5 w-4.5 transition-transform duration-200 group-hover:scale-110" style={{ color: action.color }} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={action.icon} />
            </svg>
            {action.label}
          </Link>
        ))}
      </div>

      {/* Two-column layout: Balance + Market Rates */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5 lg:gap-6">
        {/* Unified Balance Card */}
        <div className="card-base p-5 sm:p-6 lg:col-span-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-muted)]">
              <svg className="h-4.5 w-4.5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Unified Balance</h2>
              <p className="text-[11px] text-[var(--muted-foreground)]">Arc Network • Circle USDC</p>
            </div>
          </div>
          {isBalanceError ? (
            <div className="mt-5"><DataUnavailable onRetry={refetchBalance} /></div>
          ) : isBalanceLoading ? (
            <Skeleton className="mt-5 h-10 w-36" />
          ) : (
            <>
              <p className="mt-5 text-3xl font-bold tracking-tight text-[var(--foreground)] sm:text-[2rem]">
                ${formatTokenAmount(unifiedBalance)}
              </p>
              <div className="mt-5 space-y-2.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-[var(--muted-foreground)]">Arc Network</span>
                  <span className="font-medium text-[var(--foreground)]">${formatTokenAmount(arcBalance)}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Market Rates */}
        <div className="card-base p-5 sm:p-6 lg:col-span-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--accent-muted)]">
                <svg className="h-4.5 w-4.5 text-[var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-[var(--foreground)]">Market Rates</h2>
                <p className="text-[11px] text-[var(--muted-foreground)]">Live supply & borrow APY</p>
              </div>
            </div>
            <Link
              href="/dashboard/markets"
              className="rounded-lg px-3 py-1.5 text-xs font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent-muted)]"
            >
              View all →
            </Link>
          </div>
          {isMarketError ? (
            <div className="mt-4"><DataUnavailable onRetry={refetchMarket} /></div>
          ) : isMarketLoading ? (
            <div className="mt-4 space-y-3">
              <Skeleton className="h-14 w-full" />
              <Skeleton className="h-14 w-full" />
            </div>
          ) : (
            <div className="mt-5 space-y-3">
              {markets.map((market) => (
                <div
                  key={market.asset}
                  className="flex items-center justify-between rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-4 transition-colors hover:border-[var(--card-border-hover)]"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-muted)] text-sm font-bold text-[var(--accent)]">
                      {market.asset[0]}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">{market.asset}</p>
                      <p className="text-[11px] text-[var(--muted-foreground)]">
                        ${formatTokenAmount(market.totalSupplied)} supplied
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-5 sm:gap-6">
                    <div className="text-right">
                      <p className="text-[11px] text-[var(--muted-foreground)]">Supply</p>
                      <p className="text-sm font-semibold text-[var(--success)]">{market.supplyAPY.toFixed(2)}%</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] text-[var(--muted-foreground)]">Borrow</p>
                      <p className="text-sm font-semibold text-[var(--danger)]">{market.borrowAPY.toFixed(2)}%</p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="text-[11px] text-[var(--muted-foreground)]">Util.</p>
                      <p className="text-sm font-medium text-[var(--foreground)]">{market.utilization.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              ))}
              {markets.length === 0 && (
                <p className="py-6 text-center text-sm text-[var(--muted-foreground)]">
                  No market data available
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
