/**
 * Contract addresses and ABIs for ArcLend protocol on Arc Testnet.
 *
 * v2 Deployment (Arc Testnet — chainId 5042002, Auto-Collateral Model):
 *   PriceOracle:       0x31A1E71E98A3f2ABeAb9C999591cfb80a7E2641f
 *   InterestRateModel: 0xa166A2C35EE43688FAcdb22657876b83307b9065
 *   ArcLendVault:      0x299AbD3BDfE6b8d0400B105e32CEDDe7eD218Ad8
 *
 * Official Circle Assets:
 *   USDC:  0x3600000000000000000000000000000000000000
 *   EURC:  0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a
 */

// ─── Contract Addresses (Arc Testnet — v2 Auto-Collateral Deployment) ───────

export const ARCLEND_VAULT_ADDRESS =
  (process.env.NEXT_PUBLIC_LENDING_POOL_ADDRESS as `0x${string}`) ??
  '0x299AbD3BDfE6b8d0400B105e32CEDDe7eD218Ad8' as const;

export const INTEREST_RATE_MODEL_ADDRESS =
  (process.env.NEXT_PUBLIC_INTEREST_RATE_MODEL as `0x${string}`) ??
  '0xa166A2C35EE43688FAcdb22657876b83307b9065' as const;

export const PRICE_ORACLE_ADDRESS =
  (process.env.NEXT_PUBLIC_PRICE_ORACLE as `0x${string}`) ??
  '0x31A1E71E98A3f2ABeAb9C999591cfb80a7E2641f' as const;

// ─── Token Addresses (Arc Testnet — Official Circle) ────────────────────────

export const USDC_ADDRESS =
  (process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}`) ??
  '0x3600000000000000000000000000000000000000' as const;

export const EURC_ADDRESS =
  (process.env.NEXT_PUBLIC_EURC_ADDRESS as `0x${string}`) ??
  '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as const;

// ─── ArcLendVault ABI (v2 — Auto-Collateral Model) ──────────────────────────

export const arcLendVaultAbi = [
  {
    type: 'function',
    name: 'deposit',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'shares', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'withdraw',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'shares', type: 'uint256' },
    ],
    outputs: [{ name: 'amount', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'borrow',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'repay',
    inputs: [
      { name: 'asset', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'actualRepaid', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'liquidate',
    inputs: [
      { name: 'borrower', type: 'address' },
      { name: 'debtAsset', type: 'address' },
      { name: 'repayAmount', type: 'uint256' },
    ],
    outputs: [{ name: 'collateralSeized', type: 'uint256' }],
    stateMutability: 'nonpayable',
  },
  {
    type: 'function',
    name: 'getHealthFactor',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getBorrowPower',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getTotalDebt',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getUserPosition',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'shareBalance', type: 'uint256' },
          { name: 'collateralBalance', type: 'uint256' },
          { name: 'borrowPrincipal', type: 'uint256' },
          { name: 'borrowIndex', type: 'uint256' },
        ],
      },
    ],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getPoolState',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'totalShares', type: 'uint256' },
          { name: 'totalDeposits', type: 'uint256' },
          { name: 'totalBorrows', type: 'uint256' },
          { name: 'totalReserves', type: 'uint256' },
          { name: 'lastAccrualBlock', type: 'uint256' },
          { name: 'borrowIndex', type: 'uint256' },
          { name: 'depositsPaused', type: 'bool' },
          { name: 'withdrawalsPaused', type: 'bool' },
          { name: 'borrowsPaused', type: 'bool' },
          { name: 'repaymentsPaused', type: 'bool' },
        ],
      },
    ],
    stateMutability: 'view',
  },
] as const;

// ─── InterestRateModel ABI ──────────────────────────────────────────────────

export const interestRateModelAbi = [
  {
    type: 'function',
    name: 'getBorrowRate',
    inputs: [{ name: 'utilization', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getSupplyRate',
    inputs: [{ name: 'utilization', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'getUtilization',
    inputs: [
      { name: 'totalBorrows', type: 'uint256' },
      { name: 'totalSupply', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'pure',
  },
] as const;

// ─── PriceOracle ABI ────────────────────────────────────────────────────────

export const priceOracleAbi = [
  {
    type: 'function',
    name: 'getAssetPrice',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    type: 'function',
    name: 'isFeedFresh',
    inputs: [{ name: 'asset', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
  },
] as const;
