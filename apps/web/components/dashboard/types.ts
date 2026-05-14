/**
 * Shared TypeScript interfaces for the dashboard component system.
 *
 * Responsive Breakpoints (min-width media query thresholds):
 * - sm:  640px  — Single-column to two-column transitions
 * - md:  768px  — Increased content padding
 * - lg:  1024px — Desktop layout (sidebar visible, table view)
 * - xl:  1280px — Four-column grids
 * - 2xl: 1536px — Maximum content density
 *
 * Minimum supported viewport: 320px
 */

import type { ComponentType } from 'react';

/** A single navigation item rendered in the Sidebar or MobileNav. */
export interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
}

/** A single metric displayed in the PortfolioHero or StatsGrid. */
export interface PortfolioMetric {
  label: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
}

/** A row in the market table representing a single lending market. */
export interface MarketRow {
  asset: string;
  assetAddress: `0x${string}`;
  totalSupply: string;
  supplyAPY: number;
  borrowAPY: number;
  utilization: number;
}

/** Sort configuration for the market table. */
export interface SortConfig {
  column: keyof MarketRow;
  direction: 'asc' | 'desc';
}

/** Filter function signature for market table search. */
export type FilterFn = (market: MarketRow, query: string) => boolean;

/** Sort comparator function signature for market table columns. */
export type SortFn = (a: MarketRow, b: MarketRow, config: SortConfig) => number;
