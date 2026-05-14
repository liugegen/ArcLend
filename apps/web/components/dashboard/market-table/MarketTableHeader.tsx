"use client";

import type { MarketRow, SortConfig } from "../types";

interface MarketTableHeaderProps {
  sortConfig: SortConfig;
  onSort: (column: keyof MarketRow) => void;
}

interface ColumnDef {
  key: keyof MarketRow | "actions";
  label: string;
  sortable: boolean;
}

const columns: ColumnDef[] = [
  { key: "asset", label: "Asset", sortable: true },
  { key: "totalSupply", label: "Total Supply", sortable: true },
  { key: "supplyAPY", label: "Supply APY", sortable: true },
  { key: "borrowAPY", label: "Borrow APY", sortable: true },
  { key: "utilization", label: "Utilization", sortable: true },
  { key: "actions", label: "Actions", sortable: false },
];

/**
 * MarketTableHeader — sticky sortable column headers for the market table.
 *
 * Click-to-sort behavior:
 * - First click on a column: ascending
 * - Subsequent click on the same column: toggle direction
 * - Default sort: Supply APY descending
 *
 * Validates: Requirements 5.2, 5.9
 */
export function MarketTableHeader({ sortConfig, onSort }: MarketTableHeaderProps) {
  return (
    <thead className="sticky top-0 z-10">
      <tr className="border-b border-white/[0.06] bg-[#0a0e17]/95 backdrop-blur-sm">
        {columns.map((col) => {
          const isActive = col.sortable && sortConfig.column === col.key;

          return (
            <th
              key={col.key}
              scope="col"
              className={[
                "px-4 py-3 text-left text-[11px] uppercase tracking-wider font-medium",
                col.sortable
                  ? "text-white/70"
                  : "text-white/60",
                isActive ? "text-white/90" : "",
              ].join(" ")}
              aria-sort={
                isActive
                  ? sortConfig.direction === "asc"
                    ? "ascending"
                    : "descending"
                  : undefined
              }
            >
              {col.sortable ? (
                <button
                  type="button"
                  onClick={() => onSort(col.key as keyof MarketRow)}
                  aria-label={`Sort by ${col.label}${isActive ? (sortConfig.direction === "asc" ? ", currently ascending" : ", currently descending") : ""}`}
                  className="inline-flex items-center gap-1 cursor-pointer select-none hover:text-white/90 transition-colors duration-150"
                >
                  {col.label}
                  <SortIndicator
                    isActive={isActive}
                    direction={sortConfig.direction}
                  />
                </button>
              ) : (
                <span className="inline-flex items-center gap-1">
                  {col.label}
                </span>
              )}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}

interface SortIndicatorProps {
  isActive: boolean;
  direction: "asc" | "desc";
}

function SortIndicator({ isActive, direction }: SortIndicatorProps) {
  if (!isActive) {
    // Inactive: show subtle up/down arrows
    return (
      <svg
        className="w-3 h-3 text-white/30"
        viewBox="0 0 12 12"
        fill="none"
        aria-hidden="true"
      >
        <path d="M6 2L9 5H3L6 2Z" fill="currentColor" />
        <path d="M6 10L3 7H9L6 10Z" fill="currentColor" />
      </svg>
    );
  }

  // Active: show single directional arrow
  return (
    <svg
      className="w-3 h-3 text-white/90"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      {direction === "asc" ? (
        <path d="M6 2L10 7H2L6 2Z" fill="currentColor" />
      ) : (
        <path d="M6 10L2 5H10L6 10Z" fill="currentColor" />
      )}
    </svg>
  );
}
