"use client";

import type { MarketRow, SortConfig } from "../types";
import { MarketTableHeader } from "./MarketTableHeader";

interface MarketTableProps {
  markets: MarketRow[];
  sortConfig: SortConfig;
  onSort: (column: keyof MarketRow) => void;
  onClearFilter: () => void;
}

/**
 * MarketTable — desktop data table (≥1024px) displaying lending markets.
 *
 * Features:
 * - Row hover with 150ms background transition
 * - Utilization progress bars (0-100%)
 * - APY color badges (green supply, orange borrow)
 * - Supply/Borrow action buttons per row
 * - EmptyState when no markets match filter
 *
 * Validates: Requirements 5.1, 5.3, 5.4, 5.5, 5.7, 5.8, 11.3
 */
export function MarketTable({
  markets,
  sortConfig,
  onSort,
  onClearFilter,
}: MarketTableProps) {
  if (markets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 text-center w-full">
        <div className="min-w-[48px] min-h-[48px] flex items-center justify-center text-[var(--muted-foreground)] mb-4">
          <svg
            className="w-12 h-12"
            viewBox="0 0 48 48"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M24 4C12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20S35.046 4 24 4Zm0 36c-8.837 0-16-7.163-16-16S15.163 8 24 8s16 7.163 16 16-7.163 16-16 16Z"
              fill="currentColor"
              opacity="0.3"
            />
            <path
              d="M16 20h16M16 28h10"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <p className="text-sm text-[var(--muted-foreground)] leading-relaxed max-w-md mb-6">
          No markets match your current filter.
        </p>
        <button
          type="button"
          onClick={onClearFilter}
          className="inline-flex items-center justify-center px-5 py-2.5 min-h-[44px] rounded-lg bg-gradient-to-r from-[var(--accent)] to-[#a78bfa] text-white text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
        >
          Clear filter
        </button>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <MarketTableHeader sortConfig={sortConfig} onSort={onSort} />
        <tbody>
          {markets.map((market) => (
            <tr
              key={market.assetAddress}
              className="border-b border-white/[0.04] transition-colors duration-150 hover:bg-white/[0.03]"
            >
              {/* Asset */}
              <td className="px-4 py-3 font-medium text-white/90">
                {market.asset}
              </td>

              {/* Total Supply */}
              <td className="px-4 py-3 text-white/70">
                {market.totalSupply}
              </td>

              {/* Supply APY — green badge */}
              <td className="px-4 py-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/15 text-green-400">
                  {market.supplyAPY.toFixed(2)}%
                </span>
              </td>

              {/* Borrow APY — orange badge */}
              <td className="px-4 py-3">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-500/15 text-orange-400">
                  {market.borrowAPY.toFixed(2)}%
                </span>
              </td>

              {/* Utilization — progress bar */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden max-w-[100px]">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[#a78bfa] transition-all duration-300"
                      style={{ width: `${Math.min(Math.max(market.utilization, 0), 100)}%` }}
                    />
                  </div>
                  <span className="text-xs text-white/60 tabular-nums w-10 text-right">
                    {market.utilization.toFixed(0)}%
                  </span>
                </div>
              </td>

              {/* Actions */}
              <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <a
                    href={`/dashboard/supply?asset=${market.assetAddress}`}
                    aria-label={`Supply ${market.asset}`}
                    className="inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors duration-150"
                  >
                    Supply
                  </a>
                  <a
                    href={`/dashboard/borrow?asset=${market.assetAddress}`}
                    aria-label={`Borrow ${market.asset}`}
                    className="inline-flex items-center justify-center px-3 py-1.5 rounded-md text-xs font-medium bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors duration-150"
                  >
                    Borrow
                  </a>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
