/**
 * Error Mapper for ArcLend Protocol
 *
 * Maps contract revert reasons (via viem decodeErrorResult patterns) and
 * Circle SDK errors to user-friendly messages for display in the UI.
 *
 * Also provides exponential backoff utility for network error retries.
 */

import { decodeErrorResult, type Abi } from 'viem';

import {
  PaymasterUnavailableError,
  InsufficientFeeBalanceError,
  FeeBoundsError,
  AuthenticationError,
  TimeoutError,
  RateLimitError,
  TransferTimeoutError,
  AmountBoundsError,
  TransferFailedError,
} from '@arclend/circle-sdk';

import { arcLendVaultAbi } from './contracts';

// ─── Types ──────────────────────────────────────────────────────────────────

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface MappedError {
  title: string;
  message: string;
  action?: string;
  severity: ErrorSeverity;
}

// ─── Contract Error ABI (for decoding revert data) ──────────────────────────

/**
 * ABI entries for custom Solidity errors defined in Errors.sol.
 * Used by viem's decodeErrorResult to parse revert data.
 */
const errorsAbi = [
  { type: 'error', name: 'InvalidAmount', inputs: [] },
  { type: 'error', name: 'UnsupportedAsset', inputs: [] },
  { type: 'error', name: 'InsufficientAllowance', inputs: [] },
  { type: 'error', name: 'InsufficientBalance', inputs: [] },
  { type: 'error', name: 'InsufficientShares', inputs: [] },
  { type: 'error', name: 'LiquidityUnavailable', inputs: [] },
  { type: 'error', name: 'Undercollateralized', inputs: [] },
  { type: 'error', name: 'PositionHealthy', inputs: [] },
  { type: 'error', name: 'StaleOraclePrice', inputs: [] },
  { type: 'error', name: 'NoActiveDebt', inputs: [] },
  { type: 'error', name: 'Unauthorized', inputs: [] },
  { type: 'error', name: 'InvalidParameter', inputs: [] },
  { type: 'error', name: 'DepositsPaused', inputs: [] },
  { type: 'error', name: 'WithdrawalsPaused', inputs: [] },
  { type: 'error', name: 'BorrowsPaused', inputs: [] },
  { type: 'error', name: 'RepaymentsPaused', inputs: [] },
] as const satisfies Abi;

// ─── Contract Error Messages ────────────────────────────────────────────────

const CONTRACT_ERROR_MAP: Record<string, MappedError> = {
  InvalidAmount: {
    title: 'Invalid Amount',
    message: 'The amount entered is invalid. Please enter a value greater than zero.',
    severity: 'error',
  },
  UnsupportedAsset: {
    title: 'Unsupported Asset',
    message: 'This asset is not supported by the protocol. Please select USDC or EURC.',
    severity: 'error',
  },
  InsufficientAllowance: {
    title: 'Approval Required',
    message: 'You need to approve the protocol to spend your tokens before this transaction.',
    action: 'Approve Tokens',
    severity: 'warning',
  },
  InsufficientBalance: {
    title: 'Insufficient Balance',
    message: 'Your wallet balance is too low for this transaction. Please add more funds.',
    severity: 'error',
  },
  InsufficientShares: {
    title: 'Insufficient Shares',
    message: 'You are trying to withdraw more than your available balance.',
    severity: 'error',
  },
  LiquidityUnavailable: {
    title: 'Liquidity Unavailable',
    message: 'The pool does not have enough liquidity to fulfill this request. Try a smaller amount or wait for more deposits.',
    severity: 'warning',
  },
  Undercollateralized: {
    title: 'Undercollateralized',
    message: 'This operation would put your position at risk of liquidation. Add more collateral or reduce your borrow amount.',
    severity: 'error',
  },
  PositionHealthy: {
    title: 'Position is Healthy',
    message: 'This position cannot be liquidated because its health factor is above 1.0.',
    severity: 'info',
  },
  StaleOraclePrice: {
    title: 'Price Feed Stale',
    message: 'The price oracle has not been updated recently. Borrowing is temporarily unavailable until a fresh price is received.',
    severity: 'warning',
  },
  NoActiveDebt: {
    title: 'No Active Debt',
    message: 'You do not have any outstanding borrow to repay.',
    severity: 'info',
  },
  Unauthorized: {
    title: 'Unauthorized',
    message: 'You do not have permission to perform this action.',
    severity: 'error',
  },
  InvalidParameter: {
    title: 'Invalid Parameter',
    message: 'The parameter value is outside the allowed range.',
    severity: 'error',
  },
  DepositsPaused: {
    title: 'Deposits Paused',
    message: 'Deposits are temporarily paused by the protocol. Please try again later.',
    severity: 'warning',
  },
  WithdrawalsPaused: {
    title: 'Withdrawals Paused',
    message: 'Withdrawals are temporarily paused by the protocol. Please try again later.',
    severity: 'warning',
  },
  BorrowsPaused: {
    title: 'Borrowing Paused',
    message: 'Borrowing is temporarily paused by the protocol. Please try again later.',
    severity: 'warning',
  },
  RepaymentsPaused: {
    title: 'Repayments Paused',
    message: 'Repayments are temporarily paused by the protocol. Please try again later.',
    severity: 'warning',
  },
};

// ─── Contract Revert Data Parsing ───────────────────────────────────────────

/**
 * Attempt to decode contract revert data into a user-friendly error.
 * Returns null if the data cannot be decoded.
 */
function parseContractRevert(error: unknown): MappedError | null {
  // Check for viem ContractFunctionRevertedError pattern
  const revertData = extractRevertData(error);
  if (!revertData) return null;

  try {
    const decoded = decodeErrorResult({
      abi: errorsAbi,
      data: revertData,
    });

    return CONTRACT_ERROR_MAP[decoded.errorName] ?? null;
  } catch {
    return null;
  }
}

/**
 * Extract revert data hex from various error shapes.
 * Handles viem's ContractFunctionRevertedError and raw revert data.
 */
function extractRevertData(error: unknown): `0x${string}` | null {
  if (!error || typeof error !== 'object') return null;

  // viem ContractFunctionRevertedError has a `data` property
  const err = error as Record<string, unknown>;

  // Direct data field (viem pattern)
  if (typeof err.data === 'string' && err.data.startsWith('0x')) {
    return err.data as `0x${string}`;
  }

  // Nested in cause (common in wagmi/viem error chains)
  if (err.cause && typeof err.cause === 'object') {
    const cause = err.cause as Record<string, unknown>;
    if (typeof cause.data === 'string' && cause.data.startsWith('0x')) {
      return cause.data as `0x${string}`;
    }
    // Deeper nesting
    if (cause.cause && typeof cause.cause === 'object') {
      const deepCause = cause.cause as Record<string, unknown>;
      if (typeof deepCause.data === 'string' && deepCause.data.startsWith('0x')) {
        return deepCause.data as `0x${string}`;
      }
    }
  }

  // Check for error name matching (when viem already decoded it)
  if (typeof err.errorName === 'string' && err.errorName in CONTRACT_ERROR_MAP) {
    return null; // Will be handled by name matching below
  }

  return null;
}

// ─── Circle SDK Error Mapping ───────────────────────────────────────────────

function mapCircleSDKError(error: unknown): MappedError | null {
  if (error instanceof PaymasterUnavailableError) {
    return {
      title: 'Gasless Transactions Unavailable',
      message: 'The gas sponsorship service is currently unavailable. You can pay gas in ARC token instead.',
      action: 'Pay with ARC',
      severity: 'warning',
    };
  }

  if (error instanceof InsufficientFeeBalanceError) {
    const requiredFormatted = formatUSDC(error.requiredFee);
    return {
      title: 'Insufficient USDC for Gas Fee',
      message: `You need at least ${requiredFormatted} USDC to cover the gas fee. Current balance is insufficient.`,
      severity: 'error',
    };
  }

  if (error instanceof FeeBoundsError) {
    return {
      title: 'Fee Estimation Error',
      message: 'The estimated gas fee is outside expected bounds. Please try again.',
      severity: 'warning',
    };
  }

  if (error instanceof AuthenticationError) {
    return {
      title: 'Authentication Failed',
      message: `Sign-in failed: ${error.message}. Please try again.`,
      severity: 'error',
    };
  }

  if (error instanceof TimeoutError) {
    return {
      title: 'Service Unavailable',
      message: 'The service did not respond in time. Please check your connection and try again.',
      action: 'Retry',
      severity: 'warning',
    };
  }

  if (error instanceof RateLimitError) {
    const seconds = Math.ceil(error.retryAfterMs / 1000);
    return {
      title: 'Too Many Attempts',
      message: `You've made too many requests. Please wait ${seconds} seconds before trying again.`,
      severity: 'warning',
    };
  }

  if (error instanceof TransferTimeoutError) {
    return {
      title: 'Transfer Timed Out',
      message: 'The cross-chain transfer did not complete within the expected time. Your funds are safe and the transfer may still complete.',
      severity: 'warning',
    };
  }

  if (error instanceof AmountBoundsError) {
    return {
      title: 'Invalid Transfer Amount',
      message: 'The transfer amount is outside the allowed range (1 – 10,000,000 USDC).',
      severity: 'error',
    };
  }

  if (error instanceof TransferFailedError) {
    return {
      title: 'Transfer Failed',
      message: 'The cross-chain transfer failed. Your funds on the source chain have not been moved.',
      severity: 'error',
    };
  }

  return null;
}

// ─── Network Error Mapping ──────────────────────────────────────────────────

function mapNetworkError(error: unknown): MappedError | null {
  if (!(error instanceof Error)) return null;

  const message = error.message.toLowerCase();

  if (message.includes('fetch') || message.includes('network') || message.includes('econnrefused')) {
    return {
      title: 'Network Error',
      message: 'Unable to connect to the network. Please check your internet connection and try again.',
      action: 'Retry',
      severity: 'warning',
    };
  }

  if (message.includes('timeout') || message.includes('aborted')) {
    return {
      title: 'Request Timed Out',
      message: 'The request took too long to complete. Please try again.',
      action: 'Retry',
      severity: 'warning',
    };
  }

  return null;
}

// ─── Main Error Mapper ──────────────────────────────────────────────────────

/**
 * Maps any error (contract revert, Circle SDK, network) to a user-friendly
 * message with title, description, optional action, and severity level.
 *
 * Attempts parsing in order:
 * 1. Contract revert data (via viem decodeErrorResult)
 * 2. Contract error name match (when viem already decoded)
 * 3. Circle SDK typed errors
 * 4. Network/connectivity errors
 * 5. Generic fallback
 */
export function mapError(error: unknown): MappedError {
  // 1. Try parsing contract revert data
  const contractError = parseContractRevert(error);
  if (contractError) return contractError;

  // 2. Check for already-decoded error name (viem pattern)
  if (error && typeof error === 'object') {
    const err = error as Record<string, unknown>;
    if (typeof err.errorName === 'string' && err.errorName in CONTRACT_ERROR_MAP) {
      return CONTRACT_ERROR_MAP[err.errorName]!;
    }
  }

  // 3. Circle SDK errors
  const circleError = mapCircleSDKError(error);
  if (circleError) return circleError;

  // 4. Network errors
  const networkError = mapNetworkError(error);
  if (networkError) return networkError;

  // 5. Generic fallback
  const fallbackMessage = error instanceof Error
    ? error.message
    : 'An unexpected error occurred. Please try again.';

  return {
    title: 'Transaction Failed',
    message: fallbackMessage,
    severity: 'error',
  };
}

// ─── Exponential Backoff ────────────────────────────────────────────────────

/** Base delay in milliseconds for exponential backoff */
const BASE_DELAY_MS = 1_000;

/** Maximum delay in milliseconds (30 seconds) */
const MAX_DELAY_MS = 30_000;

/**
 * Calculate the delay for an exponential backoff retry.
 *
 * Formula: min(baseDelay * 2^attempt, maxDelay) + jitter
 *
 * @param attempt - Zero-based attempt number (0 = first retry)
 * @returns Delay in milliseconds before the next retry
 */
export function exponentialBackoff(attempt: number): number {
  const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
  // Add ±10% jitter to prevent thundering herd
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

/**
 * Execute a function with exponential backoff retry logic.
 *
 * @param fn - Async function to execute
 * @param maxAttempts - Maximum number of attempts (default: 5)
 * @param shouldRetry - Optional predicate to determine if error is retryable
 * @returns The result of the function
 * @throws The last error if all attempts fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 5,
  shouldRetry: (error: unknown) => boolean = isRetryableError,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (!shouldRetry(error) || attempt === maxAttempts - 1) {
        throw error;
      }

      const delay = exponentialBackoff(attempt);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Determine if an error is retryable (network/timeout errors).
 * Contract reverts and validation errors should NOT be retried.
 */
export function isRetryableError(error: unknown): boolean {
  // Circle SDK timeout errors are retryable
  if (error instanceof TimeoutError) return true;
  if (error instanceof PaymasterUnavailableError) return true;

  // Network errors are retryable
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('fetch') ||
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('aborted') ||
      message.includes('econnrefused') ||
      message.includes('econnreset')
    ) {
      return true;
    }
  }

  // Contract reverts, auth errors, validation errors are NOT retryable
  return false;
}

// ─── Utility ────────────────────────────────────────────────────────────────

/**
 * Format a USDC amount (6 decimals) to a human-readable string.
 */
function formatUSDC(amount: bigint): string {
  const whole = amount / 1_000_000n;
  const fraction = amount % 1_000_000n;
  const fractionStr = fraction.toString().padStart(6, '0').replace(/0+$/, '');
  return fractionStr ? `${whole}.${fractionStr}` : `${whole}`;
}
