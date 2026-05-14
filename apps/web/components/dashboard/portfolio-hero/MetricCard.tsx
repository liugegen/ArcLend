"use client";

import { SkeletonLoader } from "../empty-state";

interface MetricCardProps {
  /** Display label for the metric */
  label: string;
  /** Formatted value string */
  value: string;
  /** Optional secondary value (e.g. percentage change) */
  subValue?: string;
  /** Whether data is currently loading */
  isLoading?: boolean;
  /** Whether the value represents a zero/empty position */
  isZero?: boolean;
}

/**
 * MetricCard — a single metric display with glassmorphism styling and glow border.
 * Used within the PortfolioHero section to show aggregate position data.
 *
 * Validates: Requirements 3.3, 3.4, 3.5, 3.6, 7.2
 */
export function MetricCard({
  label,
  value,
  subValue,
  isLoading = false,
  isZero = false,
}: MetricCardProps) {
  return (
    <div
      className="relative rounded-xl p-5"
      style={{
        background: "rgba(255, 255, 255, 0.07)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: "0 0 8px rgba(99, 102, 241, 0.15)",
      }}
    >
      <p className="text-[11px] uppercase tracking-wider text-[var(--muted-foreground)] mb-2">
        {label}
      </p>

      {isLoading ? (
        <div className="space-y-2">
          <SkeletonLoader width="70%" height={28} />
          {subValue !== undefined && <SkeletonLoader width="40%" height={14} />}
        </div>
      ) : (
        <>
          <p
            className="text-[28px] font-bold leading-tight"
            style={{ opacity: isZero ? 0.5 : 1 }}
          >
            {value}
          </p>
          {subValue && (
            <p
              className="text-xs text-[var(--muted-foreground)] mt-1"
              style={{ opacity: isZero ? 0.5 : 1 }}
            >
              {subValue}
            </p>
          )}
        </>
      )}
    </div>
  );
}
