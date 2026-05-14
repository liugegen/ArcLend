import type { MarketRow, SortConfig } from '../types';

export function filterMarkets(markets: MarketRow[], query: string): MarketRow[] {
  if (!query.trim()) return markets;
  const normalizedQuery = query.toLowerCase().trim();
  return markets.filter(m => m.asset.toLowerCase().includes(normalizedQuery));
}

export function sortMarkets(markets: MarketRow[], config: SortConfig): MarketRow[] {
  return [...markets].sort((a, b) => {
    const aVal = a[config.column];
    const bVal = b[config.column];
    const comparison = typeof aVal === 'number' && typeof bVal === 'number'
      ? aVal - bVal
      : String(aVal).localeCompare(String(bVal));
    return config.direction === 'asc' ? comparison : -comparison;
  });
}
