"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useMarketData } from "../../../hooks/useMarketData";
import type { AssetMarketData } from "../../../hooks/useMarketData";
import type { MarketRow, SortConfig } from "../types";
import { filterMarkets, sortMarkets } from "./market-table.utils";
import { MarketTable } from "./MarketTable";
import { MarketCard } from "./MarketCard";
import { MarketSearch } from "./MarketSearch";

const MAX_RETRIES = 3;
const TIMEOUT_MS = 15_000;

/**
 * Formats a bigint total supply value (6 decimals for stablecoins) to a USD string.
 * e.g., 1234567890000n → "$1,234,567.89"
 */
function formatTotalSupply(value: bigint): string {
  const whole = Number(value / 1_000_000n);
  const fractional = Number(value % 1_000_000n);
  const cents = Math.abs(fractional).toString().padStart(6, "0").slice(0, 2);
  return `$${whole.toLocaleString()}.${cents}`;
}

/**
 * Transforms raw AssetMarketData from the hook into a MarketRow for display.
 */
function transformToMarketRow(market: AssetMarketData): MarketRow {
  return {
    asset: market.asset,
    assetAddress: market.assetAddress,
    totalSupply: formatTotalSupply(market.totalSupplied),
    supplyAPY: market.supplyAPY,
    borrowAPY: market.borrowAPY,
    utilization: market.utilization,
  };
}

/**
 * MarketTableContainer — data-fetching container for the Market Table.
 * Consumes useMarketData hook, transforms AssetMarketData[] into MarketRow[],
 * manages sort/filter state, and implements error retry pattern.
 *
 * - Default sort: Supply APY descending
 * - Filter: debounced search via MarketSearch component
 * - Error retry: max 3 retries, 15s timeout, disables after 3 failures
 * - Responsive: table on desktop (≥1024px), cards on mobile (<1024px)
 *
 * Validates: Requirements 5.1, 5.6, 5.9, 8.4, 8.6, 12.3
 */
export function MarketTableContainer() {
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: "supplyAPY",
    direction: "desc",
  });
  const [filterQuery, setFilterQuery] = useState("");
  const [retryCount, setRetryCount] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { markets, isLoading, isError, refetch } = useMarketData();

  const hasError = isError || timedOut;
  const canRetry = retryCount < MAX_RETRIES;

  // 15s timeout: if still loading after 15s, treat as error
  useEffect(() => {
    if (isLoading && !isError) {
      timeoutRef.current = setTimeout(() => {
        setTimedOut(true);
      }, TIMEOUT_MS);
    } else {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      // Reset timedOut when data loads successfully
      if (!isLoading && !isError) {
        setTimedOut(false);
      }
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [isLoading, isError]);

  const handleRetry = useCallback(() => {
    if (!canRetry) return;
    setRetryCount((prev) => prev + 1);
    setTimedOut(false);
    refetch();
  }, [canRetry, refetch]);

  // Transform raw market data into MarketRow[]
  const marketRows = useMemo(
    () => markets.map(transformToMarketRow),
    [markets]
  );

  // Apply filter then sort
  const processedMarkets = useMemo(() => {
    const filtered = filterMarkets(marketRows, filterQuery);
    return sortMarkets(filtered, sortConfig);
  }, [marketRows, filterQuery, sortConfig]);

  // Sort handler: toggle direction if same column, set ascending if new column
  const handleSort = useCallback(
    (column: keyof MarketRow) => {
      setSortConfig((prev) => {
        if (prev.column === column) {
          return {
            column,
            direction: prev.direction === "asc" ? "desc" : "asc",
          };
        }
        return { column, direction: "asc" };
      });
    },
    []
  );

  const handleFilterChange = useCallback((query: string) => {
    setFilterQuery(query);
  }, []);

  const handleClearFilter = useCallback(() => {
    setFilterQuery("");
  }, []);

  // Loading state
  if (isLoading && !timedOut) {
    return (
      <div className="w-full space-y-3">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-16 w-full rounded-lg animate-pulse"
            style={{ background: "rgba(255, 255, 255, 0.04)" }}
          />
        ))}
      </div>
    );
  }

  // Error state
  if (hasError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center w-full">
        <p className="text-sm text-[var(--muted-foreground)] mb-4">
          {canRetry
            ? "Failed to load market data. Please try again."
            : "Unable to load market data. Please try again later."}
        </p>
        <button
          type="button"
          onClick={handleRetry}
          disabled={!canRetry}
          className="inline-flex items-center justify-center px-5 py-2.5 min-h-[44px] rounded-lg bg-gradient-to-r from-[var(--accent)] to-[#a78bfa] text-white text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      {/* Search input */}
      <MarketSearch value={filterQuery} onChange={handleFilterChange} />

      {/* Desktop table (≥1024px) */}
      <div className="hidden lg:block">
        <MarketTable
          markets={processedMarkets}
          sortConfig={sortConfig}
          onSort={handleSort}
          onClearFilter={handleClearFilter}
        />
      </div>

      {/* Mobile cards (<1024px) */}
      <div className="lg:hidden space-y-3">
        {processedMarkets.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center w-full">
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              No markets match your current filter.
            </p>
            <button
              type="button"
              onClick={handleClearFilter}
              className="inline-flex items-center justify-center px-5 py-2.5 min-h-[44px] rounded-lg bg-gradient-to-r from-[var(--accent)] to-[#a78bfa] text-white text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            >
              Clear filter
            </button>
          </div>
        ) : (
          processedMarkets.map((market) => (
            <MarketCard key={market.assetAddress} market={market} />
          ))
        )}
      </div>
    </div>
  );
}
