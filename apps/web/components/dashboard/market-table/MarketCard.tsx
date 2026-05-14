"use client";

import type { MarketRow } from "../types";

interface MarketCardProps {
  market: MarketRow;
}

/**
 * MarketCard — mobile card fallback (<1024px) for a single market row.
 *
 * Vertically stacked layout with all data fields, no horizontal overflow.
 * Uses the same APY badge colors and utilization bar as the desktop table.
 *
 * Validates: Requirements 5.7, 11.3
 */
export function MarketCard({ market }: MarketCardProps) {
  return (
    <div className="w-full rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 backdrop-blur-sm">
      {/* Asset header */}
      <div className="mb-3">
        <h3 className="text-base font-semibold text-white/90">
          {market.asset}
        </h3>
      </div>

      {/* Data fields */}
      <div className="space-y-3">
        {/* Total Supply */}
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-white/60">
            Total Supply
          </span>
          <span className="text-sm text-white/70">{market.totalSupply}</span>
        </div>

        {/* Supply APY */}
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-white/60">
            Supply APY
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/15 text-green-400">
            {market.supplyAPY.toFixed(2)}%
          </span>
        </div>

        {/* Borrow APY */}
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-white/60">
            Borrow APY
          </span>
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-500/15 text-orange-400">
            {market.borrowAPY.toFixed(2)}%
          </span>
        </div>

        {/* Utilization */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs uppercase tracking-wider text-white/60">
              Utilization
            </span>
            <span className="text-xs text-white/60 tabular-nums">
              {market.utilization.toFixed(0)}%
            </span>
          </div>
          <div className="w-full h-2 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[var(--accent)] to-[#a78bfa] transition-all duration-300"
              style={{ width: `${Math.min(Math.max(market.utilization, 0), 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-white/[0.06]">
        <a
          href={`/dashboard/supply?asset=${market.assetAddress}`}
          aria-label={`Supply ${market.asset}`}
          className="flex-1 inline-flex items-center justify-center px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors duration-150"
        >
          Supply
        </a>
        <a
          href={`/dashboard/borrow?asset=${market.assetAddress}`}
          aria-label={`Borrow ${market.asset}`}
          className="flex-1 inline-flex items-center justify-center px-3 py-2 min-h-[44px] rounded-lg text-sm font-medium bg-orange-500/10 text-orange-400 hover:bg-orange-500/20 transition-colors duration-150"
        >
          Borrow
        </a>
      </div>
    </div>
  );
}
