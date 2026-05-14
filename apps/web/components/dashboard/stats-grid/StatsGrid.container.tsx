"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useUnifiedBalance } from "../../../hooks/useUnifiedBalance";
import { useMarketData } from "../../../hooks/useMarketData";
import type { PortfolioMetric } from "../types";
import { StatsGrid } from "./StatsGrid";

const MAX_RETRIES = 3;
const TIMEOUT_MS = 15_000;

/**
 * Formats a bigint USDC value (6 decimals) to a USD display string.
 */
function formatUSDC(value: bigint): string {
  const whole = value / 1_000_000n;
  const fractional = value % 1_000_000n;
  const cents = fractional.toString().padStart(6, "0").slice(0, 2);
  return `$${whole.toLocaleString()}.${cents}`;
}

/**
 * StatsGridContainer — data-fetching container for the StatsGrid.
 * Consumes useUnifiedBalance and useMarketData hooks, transforms data
 * into PortfolioMetric[] for display.
 *
 * Implements error retry pattern: max 3 retries, disables after 3 failures.
 * 15-second timeout triggers error state if data hasn't loaded.
 *
 * Validates: Requirements 4.1, 4.2, 8.4, 8.6, 12.3
 */
export function StatsGridContainer() {
  const [retryCount, setRetryCount] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    unifiedBalance,
    isLoading: isBalanceLoading,
    isError: isBalanceError,
    refetch: refetchBalance,
  } = useUnifiedBalance();

  const {
    markets,
    isLoading: isMarketLoading,
    isError: isMarketError,
    refetch: refetchMarket,
  } = useMarketData();

  const isLoading = isBalanceLoading || isMarketLoading;
  const isError = isBalanceError || isMarketError || timedOut;
  const canRetry = retryCount < MAX_RETRIES;

  // 15s timeout: if still loading after 15s, treat as error
  useEffect(() => {
    if (isLoading && !isBalanceError && !isMarketError) {
      timeoutRef.current = setTimeout(() => {
        setTimedOut(true);
      }, TIMEOUT_MS);
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      // Reset timedOut when data loads successfully
      if (!isBalanceLoading && !isMarketLoading && !isBalanceError && !isMarketError) {
        setTimedOut(false);
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isLoading, isBalanceError, isMarketError, isBalanceLoading, isMarketLoading]);

  const handleRetry = useCallback(() => {
    if (!canRetry) return;
    setRetryCount((prev) => prev + 1);
    setTimedOut(false);
    refetchBalance();
    refetchMarket();
  }, [canRetry, refetchBalance, refetchMarket]);

  // Transform hook data into PortfolioMetric[]
  const stats: PortfolioMetric[] = [];

  if (!isLoading && !isError) {
    // Wallet Balance metric
    stats.push({
      label: "Wallet Balance",
      value: formatUSDC(unifiedBalance),
      subValue: "USDC on Arc Network",
    });

    // Total markets metric
    stats.push({
      label: "Active Markets",
      value: markets.length.toString(),
      subValue: markets.map((m) => m.asset).join(", ") || "None",
    });

    // Average Supply APY across markets
    const avgSupplyAPY =
      markets.length > 0
        ? markets.reduce((sum, m) => sum + m.supplyAPY, 0) / markets.length
        : 0;
    stats.push({
      label: "Avg Supply APY",
      value: `${avgSupplyAPY.toFixed(2)}%`,
      subValue: "Across all markets",
      trend: avgSupplyAPY > 0 ? "up" : "neutral",
    });

    // Average Borrow APY across markets
    const avgBorrowAPY =
      markets.length > 0
        ? markets.reduce((sum, m) => sum + m.borrowAPY, 0) / markets.length
        : 0;
    stats.push({
      label: "Avg Borrow APY",
      value: `${avgBorrowAPY.toFixed(2)}%`,
      subValue: "Across all markets",
      trend: avgBorrowAPY > 0 ? "up" : "neutral",
    });
  }

  return (
    <StatsGrid
      stats={stats}
      isLoading={isLoading}
      isError={isError}
      canRetry={canRetry}
      onRetry={handleRetry}
    />
  );
}
