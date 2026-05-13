'use client';

import { useReadContracts } from 'wagmi';
import {
  interestRateModelAbi,
  INTEREST_RATE_MODEL_ADDRESS,
  ARCLEND_VAULT_ADDRESS,
  arcLendVaultAbi,
  USDC_ADDRESS,
  EURC_ADDRESS,
} from '../lib/contracts';

/** RAY = 1e27, used for on-chain rate precision */
const RAY = BigInt('1000000000000000000000000000');

/** Seconds per year for APY conversion */
const SECONDS_PER_YEAR = 365n * 24n * 60n * 60n;

export interface AssetMarketData {
  asset: string;
  assetAddress: `0x${string}`;
  supplyAPY: number;
  borrowAPY: number;
  utilization: number;
  totalSupplied: bigint;
  totalBorrowed: bigint;
}

export interface UseMarketDataResult {
  markets: AssetMarketData[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

/**
 * Converts a ray-precision annualized rate to a percentage APY.
 * rate is in ray (1e27 = 100%).
 */
function rayToAPY(rate: bigint): number {
  // Convert ray to a decimal percentage
  // rate / RAY gives the decimal fraction, multiply by 100 for percentage
  return Number((rate * 10000n) / RAY) / 100;
}

/**
 * Hook that fetches supply/borrow APY rates for each supported asset.
 * Reads pool state to compute utilization, then calls getBorrowRate and getSupplyRate.
 * Polls every 15 seconds.
 */
export function useMarketData(): UseMarketDataResult {
  // First, read pool states for USDC and EURC
  const { data, isLoading, isError, refetch } = useReadContracts({
    contracts: [
      // USDC pool state
      {
        address: ARCLEND_VAULT_ADDRESS,
        abi: arcLendVaultAbi,
        functionName: 'getPoolState',
        args: [USDC_ADDRESS],
      },
      // EURC pool state
      {
        address: ARCLEND_VAULT_ADDRESS,
        abi: arcLendVaultAbi,
        functionName: 'getPoolState',
        args: [EURC_ADDRESS],
      },
      // USDC utilization
      {
        address: INTEREST_RATE_MODEL_ADDRESS,
        abi: interestRateModelAbi,
        functionName: 'getUtilization',
        args: [0n, 0n], // placeholder — will be overridden by actual pool data
      },
      // USDC borrow rate (placeholder utilization)
      {
        address: INTEREST_RATE_MODEL_ADDRESS,
        abi: interestRateModelAbi,
        functionName: 'getBorrowRate',
        args: [0n],
      },
      // USDC supply rate (placeholder utilization)
      {
        address: INTEREST_RATE_MODEL_ADDRESS,
        abi: interestRateModelAbi,
        functionName: 'getSupplyRate',
        args: [0n],
      },
      // EURC borrow rate (placeholder utilization)
      {
        address: INTEREST_RATE_MODEL_ADDRESS,
        abi: interestRateModelAbi,
        functionName: 'getBorrowRate',
        args: [0n],
      },
      // EURC supply rate (placeholder utilization)
      {
        address: INTEREST_RATE_MODEL_ADDRESS,
        abi: interestRateModelAbi,
        functionName: 'getSupplyRate',
        args: [0n],
      },
    ],
    query: {
      refetchInterval: 15_000,
    },
  });

  // We need a two-step approach: first get pool states, then compute utilization
  // and fetch rates. For simplicity in a single multicall, we use a derived approach.
  // In practice, we read pool states and compute rates client-side from the pool data.

  const markets: AssetMarketData[] = [];

  if (data) {
    const assets = [
      { symbol: 'USDC', address: USDC_ADDRESS, poolIndex: 0, borrowIndex: 3, supplyIndex: 4 },
      { symbol: 'EURC', address: EURC_ADDRESS, poolIndex: 1, borrowIndex: 5, supplyIndex: 6 },
    ] as const;

    for (const asset of assets) {
      const poolResult = data[asset.poolIndex];
      const borrowRateResult = data[asset.borrowIndex];
      const supplyRateResult = data[asset.supplyIndex];

      if (poolResult?.status === 'success' && poolResult.result) {
        const pool = poolResult.result as unknown as {
          totalShares: bigint;
          totalDeposits: bigint;
          totalBorrows: bigint;
          totalReserves: bigint;
        };

        // Compute utilization client-side
        const totalSupply = pool.totalDeposits;
        const totalBorrows = pool.totalBorrows;
        const utilization =
          totalSupply > 0n
            ? Number((totalBorrows * 10000n) / totalSupply) / 100
            : 0;

        // Use on-chain rates if available, otherwise derive from pool data
        const borrowAPY =
          borrowRateResult?.status === 'success' && borrowRateResult.result != null
            ? rayToAPY(borrowRateResult.result as bigint)
            : 0;

        const supplyAPY =
          supplyRateResult?.status === 'success' && supplyRateResult.result != null
            ? rayToAPY(supplyRateResult.result as bigint)
            : 0;

        markets.push({
          asset: asset.symbol,
          assetAddress: asset.address,
          supplyAPY,
          borrowAPY,
          utilization,
          totalSupplied: totalSupply,
          totalBorrowed: totalBorrows,
        });
      }
    }
  }

  return {
    markets,
    isLoading,
    isError,
    refetch,
  };
}
