"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useUserPosition } from "../../../hooks/useUserPosition";
import { useHealthFactor } from "../../../hooks/useHealthFactor";
import { useMarketData } from "../../../hooks/useMarketData";
import type { PortfolioMetric } from "../types";
import { PortfolioHero } from "./PortfolioHero";

const MAX_RETRIES = 3;
const TIMEOUT_MS = 15_000;

/**
 * Helper: format bigint token amounts (6 decimals for USDC/EURC) to USD string.
 */
function formatUSD(amount: bigint, decimals = 6): string {
  const divisor = BigInt(10 ** decimals);
  const whole = amount / divisor;
  const fraction = amount % divisor;
  const fractionStr = fraction.toString().padStart(decimals, "0").slice(0, 2);
  return `$${whole.toLocaleString()}.${fractionStr}`;
}

/**
 * Container component for the Portfolio Hero section.
 * Consumes useUserPosition, useHealthFactor, and useMarketData hooks,
 * transforms data into PortfolioMetric[], and manages error retry logic.
 */
export function PortfolioHeroContainer() {
  const {
    position,
    usdcPoolState,
    isLoading: isPositionLoading,
    isError: isPositionError,
    refetch: refetchPosition,
  } = useUserPosition();

  const {
    healthFactor,
    isLoading: isHFLoading,
    isError: isHFError,
    refetch: refetchHF,
  } = useHealthFactor();

  const {
    markets,
    isLoading: isMarketLoading,
    isError: isMarketError,
    refetch: refetchMarket,
  } = useMarketData();

  // --- Error retry state ---
  const [retryCount, setRetryCount] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isLoading = isPositionLoading || isHFLoading || isMarketLoading;
  const isError = isPositionError || isHFError || isMarketError || timedOut;
  const canRetry = retryCount < MAX_RETRIES;

  // --- 15s timeout: if still loading after 15s, treat as error ---
  useEffect(() => {
    if (isLoading && !isError) {
      timeoutRef.current = setTimeout(() => {
        setTimedOut(true);
      }, TIMEOUT_MS);
    } else {
      // Clear timeout if loading finishes or error already present
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      // Reset timedOut when data loads successfully
      if (!isPositionLoading && !isHFLoading && !isMarketLoading && !isPositionError && !isHFError && !isMarketError) {
        setTimedOut(false);
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isLoading, isError, isPositionLoading, isHFLoading, isMarketLoading, isPositionError, isHFError, isMarketError]);

  // --- Retry handler ---
  const handleRetry = useCallback(() => {
    if (!canRetry) return;
    setRetryCount((prev) => prev + 1);
    setTimedOut(false);
    refetchPosition();
    refetchHF();
    refetchMarket();
  }, [canRetry, refetchPosition, refetchHF, refetchMarket]);

  // --- Compute derived values ---
  let suppliedBalance = 0n;
  let borrowedBalance = 0n;

  if (position && usdcPoolState) {
    if (usdcPoolState.totalShares > 0n) {
      suppliedBalance =
        (position.supplyShares * usdcPoolState.totalDeposits) /
        usdcPoolState.totalShares;
    }
    if (position.borrowIndex > 0n) {
      borrowedBalance =
        (position.borrowPrincipal * usdcPoolState.borrowIndex) /
        position.borrowIndex;
    }
  }

  // --- Compute Net APY ---
  const usdcMarket = markets.find((m) => m.asset === "USDC");
  let netAPY = 0;
  if (suppliedBalance > 0n || borrowedBalance > 0n) {
    const supplyEarnings = usdcMarket
      ? Number(suppliedBalance) * (usdcMarket.supplyAPY / 100)
      : 0;
    const borrowCost = usdcMarket
      ? Number(borrowedBalance) * (usdcMarket.borrowAPY / 100)
      : 0;
    const denominator = Number(suppliedBalance || 1n);
    if (denominator > 0) {
      netAPY = ((supplyEarnings - borrowCost) / denominator) * 100;
    }
  }

  // --- Transform into PortfolioMetric[] ---
  const metrics: PortfolioMetric[] = [
    {
      label: "Total Supplied",
      value: formatUSD(suppliedBalance),
    },
    {
      label: "Total Borrowed",
      value: formatUSD(borrowedBalance),
    },
    {
      label: "Net APY",
      value: `${netAPY >= 0 ? "+" : ""}${netAPY.toFixed(2)}%`,
      trend: netAPY > 0 ? "up" : netAPY < 0 ? "down" : "neutral",
    },
    {
      label: "Health Factor",
      value: healthFactor != null ? healthFactor.toFixed(2) : "∞",
    },
  ];

  // --- Render ---
  return (
    <div data-testid="portfolio-hero-container">
      {isError && (
        <div data-testid="portfolio-hero-error" className="flex items-center gap-2">
          <span>Unable to load portfolio data.</span>
          <button
            onClick={handleRetry}
            disabled={!canRetry}
            data-testid="portfolio-hero-retry"
            aria-label="Retry loading portfolio data"
          >
            {canRetry ? "Retry" : "Try again later"}
          </button>
        </div>
      )}
      {!isError && (
        <PortfolioHero metrics={metrics} isLoading={isLoading} />
      )}
    </div>
  );
}
