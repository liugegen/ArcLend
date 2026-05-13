/**
 * Contract addresses and ABIs for ArcLend protocol on Arc Network.
 */

// ─── Contract Addresses (Arc Testnet) ───────────────────────────────────────

export const ARCLEND_VAULT_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const;

export const INTEREST_RATE_MODEL_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const;

export const PRICE_ORACLE_ADDRESS =
  '0x0000000000000000000000000000000000000000' as const;

// ─── Token Addresses (Arc Testnet) ──────────────────────────────────────────

export const USDC_ADDRESS =
  '0x3600000000000000000000000000000000000000' as const;

export const EURC_ADDRESS =
  '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as const;

export const USYC_ADDRESS =
  '0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C' as const;

// ─── ArcLendVault ABI ───────────────────────────────────────────────────────

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
    name: 'getUserPosition',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [
      {
        name: '',
        type: 'tuple',
        components: [
          { name: 'supplyShares', type: 'uint256' },
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
