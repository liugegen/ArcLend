'use client';

import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
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

// ─── Data Unavailable Indicator ─────────────────────────────────────────────

function DataUnavailable({
  onRetry,
  retryIn,
}: {
  onRetry: () => void;
  retryIn: number | null;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
      <svg
        className="h-4 w-4 flex-shrink-0"
        fill="currentColor"
        viewBox="0 0 20 20"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
      <span>Data unavailable</span>
      {retryIn != null && (
        <span className="text-yellow-600">— retrying in {retryIn}s</span>
      )}
      <button
        onClick={onRetry}
        className="ml-auto rounded bg-yellow-200 px-2 py-1 text-xs font-medium text-yellow-900 hover:bg-yellow-300"
      >
        Retry now
      </button>
    </div>
  );
}

// ─── Auto-Retry Hook ────────────────────────────────────────────────────────

function useAutoRetry(isError: boolean, refetch: () => void) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const countdownRef = useRef<number>(10);

  useEffect(() => {
    if (isError) {
      countdownRef.current = 10;
      timerRef.current = setInterval(() => {
        countdownRef.current -= 1;
        if (countdownRef.current <= 0) {
          refetch();
          countdownRef.current = 10;
        }
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isError, refetch]);
}

// ─── Dashboard Page ─────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { isConnected } = useAccount();

  const {
    position,
    usdcPoolState,
    eurcPoolState,
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
    preCreditedBalance,
    isLoading: isBalanceLoading,
    isError: isBalanceError,
    refetch: refetchBalance,
  } = useUnifiedBalance();

  // Auto-retry on errors (10-second interval)
  useAutoRetry(isPositionError, refetchPosition);
  useAutoRetry(isMarketError, refetchMarket);
  useAutoRetry(isHFError, refetchHF);
  useAutoRetry(isBalanceError, refetchBalance);

  // ─── Not Connected State ────────────────────────────────────────────────

  if (!isConnected) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">ArcLend Dashboard</h1>
          <p className="mt-2 text-gray-600">
            Connect your wallet to view your positions.
          </p>
        </div>
      </main>
    );
  }

  // ─── Compute Supplied/Borrowed Balances ─────────────────────────────────

  let suppliedBalance = 0n;
  let borrowedBalance = 0n;

  if (position && usdcPoolState) {
    // Convert shares to underlying: shares × totalDeposits / totalShares
    if (usdcPoolState.totalShares > 0n) {
      suppliedBalance =
        (position.supplyShares * usdcPoolState.totalDeposits) /
        usdcPoolState.totalShares;
    }
    // Borrow balance: principal × currentBorrowIndex / userBorrowIndex
    if (position.borrowIndex > 0n) {
      borrowedBalance =
        (position.borrowPrincipal * usdcPoolState.borrowIndex) /
        position.borrowIndex;
    }
  }

  // ─── Compute Net APY ────────────────────────────────────────────────────

  const usdcMarket = markets.find((m) => m.asset === 'USDC');
  const eurcMarket = markets.find((m) => m.asset === 'EURC');

  // Net APY = weighted supply APY - weighted borrow APY
  // Simplified: use USDC supply APY minus USDC borrow APY weighted by balances
  let netAPY = 0;
  if (suppliedBalance > 0n || borrowedBalance > 0n) {
    const supplyEarnings = usdcMarket
      ? Number(suppliedBalance) * (usdcMarket.supplyAPY / 100)
      : 0;
    const borrowCost = usdcMarket
      ? Number(borrowedBalance) * (usdcMarket.borrowAPY / 100)
      : 0;
    const totalValue = Number(suppliedBalance) + Number(borrowedBalance);
    if (totalValue > 0) {
      netAPY = ((supplyEarnings - borrowCost) / Number(suppliedBalance || 1n)) * 100;
    }
  }

  // ─── Render ─────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Your ArcLend positions and market overview
        </p>

        {/* Health Factor Warning Banner */}
        {isWarning && healthFactor != null && (
          <div
            className={`mt-4 rounded-lg border px-4 py-3 ${
              isLiquidatable
                ? 'border-red-300 bg-red-50 text-red-800'
                : 'border-orange-300 bg-orange-50 text-orange-800'
            }`}
            role="alert"
          >
            <div className="flex items-center gap-2">
              <svg
                className="h-5 w-5 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.168 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z"
                  clipRule="evenodd"
                />
              </svg>
              <span className="font-semibold">
                {isLiquidatable
                  ? 'Liquidation Risk — Your position may be liquidated'
                  : 'Warning — Liquidation risk is elevated'}
              </span>
              <span className="ml-auto font-mono text-sm">
                Health Factor: {healthFactor.toFixed(4)}
              </span>
            </div>
          </div>
        )}

        {/* Position Overview Cards */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Supplied Balance */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Total Supplied</p>
            {isPositionError ? (
              <DataUnavailable onRetry={refetchPosition} retryIn={10} />
            ) : isPositionLoading ? (
              <div className="mt-2 h-8 w-24 animate-pulse rounded bg-gray-200" />
            ) : (
              <p className="mt-2 text-2xl font-bold text-gray-900">
                ${formatTokenAmount(suppliedBalance)}
              </p>
            )}
          </div>

          {/* Borrowed Balance */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Total Borrowed</p>
            {isPositionError ? (
              <DataUnavailable onRetry={refetchPosition} retryIn={10} />
            ) : isPositionLoading ? (
              <div className="mt-2 h-8 w-24 animate-pulse rounded bg-gray-200" />
            ) : (
              <p className="mt-2 text-2xl font-bold text-gray-900">
                ${formatTokenAmount(borrowedBalance)}
              </p>
            )}
          </div>

          {/* Net APY */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Net APY</p>
            {isMarketError ? (
              <DataUnavailable onRetry={refetchMarket} retryIn={10} />
            ) : isMarketLoading ? (
              <div className="mt-2 h-8 w-24 animate-pulse rounded bg-gray-200" />
            ) : (
              <p
                className={`mt-2 text-2xl font-bold ${
                  netAPY >= 0 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {netAPY >= 0 ? '+' : ''}
                {netAPY.toFixed(2)}%
              </p>
            )}
          </div>

          {/* Health Factor */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-gray-500">Health Factor</p>
            {isHFError ? (
              <DataUnavailable onRetry={refetchHF} retryIn={10} />
            ) : isHFLoading ? (
              <div className="mt-2 h-8 w-24 animate-pulse rounded bg-gray-200" />
            ) : (
              <p
                className={`mt-2 text-2xl font-bold ${
                  healthFactor == null
                    ? 'text-gray-400'
                    : isLiquidatable
                      ? 'text-red-600'
                      : isWarning
                        ? 'text-orange-500'
                        : 'text-green-600'
                }`}
              >
                {healthFactor != null ? healthFactor.toFixed(4) : '—'}
              </p>
            )}
          </div>
        </div>

        {/* Unified Balance */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Unified USDC Balance
          </h2>
          <p className="text-sm text-gray-500">
            Aggregated across Arc Network and Arbitrum
          </p>
          {isBalanceError ? (
            <div className="mt-3">
              <DataUnavailable onRetry={refetchBalance} retryIn={10} />
            </div>
          ) : isBalanceLoading ? (
            <div className="mt-3 h-8 w-32 animate-pulse rounded bg-gray-200" />
          ) : (
            <div className="mt-3">
              <p className="text-3xl font-bold text-gray-900">
                ${formatTokenAmount(unifiedBalance)}
              </p>
              <div className="mt-2 flex gap-6 text-sm text-gray-500">
                <span>Arc Network: ${formatTokenAmount(arcBalance)}</span>
                <span>
                  Pre-credited (Arbitrum): ${formatTokenAmount(preCreditedBalance)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Market Rates */}
        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">Market Rates</h2>
          <p className="text-sm text-gray-500">
            Supply and borrow APY for supported assets (updates every 15s)
          </p>
          {isMarketError ? (
            <div className="mt-3">
              <DataUnavailable onRetry={refetchMarket} retryIn={10} />
            </div>
          ) : isMarketLoading ? (
            <div className="mt-3 space-y-2">
              <div className="h-12 animate-pulse rounded bg-gray-200" />
              <div className="h-12 animate-pulse rounded bg-gray-200" />
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-gray-500">
                    <th className="pb-2 font-medium">Asset</th>
                    <th className="pb-2 font-medium">Supply APY</th>
                    <th className="pb-2 font-medium">Borrow APY</th>
                    <th className="pb-2 font-medium">Utilization</th>
                    <th className="pb-2 font-medium">Total Supplied</th>
                    <th className="pb-2 font-medium">Total Borrowed</th>
                  </tr>
                </thead>
                <tbody>
                  {markets.map((market) => (
                    <tr
                      key={market.asset}
                      className="border-b border-gray-50"
                    >
                      <td className="py-3 font-medium text-gray-900">
                        {market.asset}
                      </td>
                      <td className="py-3 text-green-600">
                        {market.supplyAPY.toFixed(2)}%
                      </td>
                      <td className="py-3 text-red-600">
                        {market.borrowAPY.toFixed(2)}%
                      </td>
                      <td className="py-3 text-gray-700">
                        {market.utilization.toFixed(1)}%
                      </td>
                      <td className="py-3 text-gray-700">
                        ${formatTokenAmount(market.totalSupplied)}
                      </td>
                      <td className="py-3 text-gray-700">
                        ${formatTokenAmount(market.totalBorrowed)}
                      </td>
                    </tr>
                  ))}
                  {markets.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-4 text-center text-gray-400"
                      >
                        No market data available
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
