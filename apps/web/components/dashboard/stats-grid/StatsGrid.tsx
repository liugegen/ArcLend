"use client";

import type { PortfolioMetric } from "../types";
import { StatCard } from "./StatCard";
import { SkeletonLoader } from "../empty-state/SkeletonLoader";

interface StatsGridProps {
  /** Array of metrics to display */
  stats: PortfolioMetric[];
  /** Whether data is currently loading */
  isLoading?: boolean;
  /** Whether a data fetch error occurred */
  isError?: boolean;
  /** Whether the retry button is still available */
  canRetry?: boolean;
  /** Callback to retry failed data fetch */
  onRetry?: () => void;
}

/**
 * StatsGrid — responsive grid of equal-height metric cards.
 *
 * Layout:
 * - 1 column below 640px, gap 16px
 * - 2 columns from 640px to 1279px, gap 24px
 * - 4 columns at 1280px and above, gap 24px
 *
 * Validates: Requirements 4.1, 4.2, 8.4, 8.6
 */
export function StatsGrid({
  stats,
  isLoading = false,
  isError = false,
  canRetry = true,
  onRetry,
}: StatsGridProps) {
  // Loading state: show skeleton placeholders
  if (isLoading) {
    return (
      <div
        className={[
          "grid",
          "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
          "gap-4 sm:gap-6",
        ].join(" ")}
      >
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonLoader key={i} height={120} className="rounded-xl" />
        ))}
      </div>
    );
  }

  // Error state: show inline error with retry
  if (isError) {
    return (
      <div className="rounded-xl bg-white/[0.04] border border-white/[0.06] p-6 text-center">
        <p className="text-white/70 text-sm mb-3">
          Failed to load stats data.
        </p>
        {canRetry ? (
          <button
            onClick={onRetry}
            className={[
              "px-4 py-2 rounded-lg text-sm font-medium",
              "bg-gradient-to-r from-indigo-500 to-purple-400",
              "text-white hover:opacity-90 transition-opacity duration-150",
            ].join(" ")}
          >
            Retry
          </button>
        ) : (
          <p className="text-white/50 text-xs">
            Please try again later.
          </p>
        )}
      </div>
    );
  }

  // Data state: render stat cards in responsive grid
  return (
    <div
      className={[
        "grid",
        "grid-cols-1 sm:grid-cols-2 xl:grid-cols-4",
        "gap-4 sm:gap-6",
      ].join(" ")}
    >
      {stats.map((stat) => (
        <StatCard
          key={stat.label}
          label={stat.label}
          value={stat.value}
          secondaryText={stat.subValue}
        />
      ))}
    </div>
  );
}
