/**
 * Embedded Wallet Module
 *
 * Implements IEmbeddedWalletModule using Circle's Modular Wallets SDK
 * for social login wallet creation, signing, and restoration.
 */

import type {
  AuthCredentials,
  AuthProvider,
  IEmbeddedWalletModule,
  SignedUserOperation,
  UserOperation,
  WalletInfo,
  WalletSession,
} from './types';

// ─── Error Types ────────────────────────────────────────────────────────────

/** Thrown when authentication fails (invalid credentials, provider error). */
export class AuthenticationError extends Error {
  public readonly provider: AuthProvider;
  public readonly cause?: unknown;

  constructor(message: string, provider: AuthProvider, cause?: unknown) {
    super(message);
    this.name = 'AuthenticationError';
    this.provider = provider;
    this.cause = cause;
  }
}

/** Thrown when a Circle API call exceeds the 10-second timeout. */
export class TimeoutError extends Error {
  public readonly operationName: string;
  public readonly timeoutMs: number;

  constructor(operationName: string, timeoutMs: number = 10_000) {
    super(
      `Operation "${operationName}" timed out after ${timeoutMs}ms. Circle service may be unavailable.`,
    );
    this.name = 'TimeoutError';
    this.operationName = operationName;
    this.timeoutMs = timeoutMs;
  }
}

/** Thrown when the user exceeds the maximum failed auth attempts (5 per 15 min). */
export class RateLimitError extends Error {
  public readonly retryAfterMs: number;

  constructor(retryAfterMs: number) {
    super(
      `Rate limit exceeded: maximum 5 failed authentication attempts per 15-minute window. Retry after ${Math.ceil(retryAfterMs / 1000)} seconds.`,
    );
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

// ─── Configuration ──────────────────────────────────────────────────────────

export interface EmbeddedWalletConfig {
  /** Base URL for Circle's Modular Wallets API. */
  baseUrl: string;
  /** API key for authenticating with Circle. */
  apiKey: string;
  /** Chain ID for the target network (default: 5042002 for Arc Testnet). */
  chainId?: number;
  /** Timeout in milliseconds for API calls (default: 10000). */
  timeoutMs?: number;
}

// ─── Rate Limiting ──────────────────────────────────────────────────────────

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const RATE_LIMIT_MAX_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// ─── Implementation ─────────────────────────────────────────────────────────

export class EmbeddedWalletModule implements IEmbeddedWalletModule {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly chainId: number;
  private readonly timeoutMs: number;
  private readonly failedAttempts: Map<string, RateLimitEntry> = new Map();

  constructor(config: EmbeddedWalletConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, '');
    this.apiKey = config.apiKey;
    this.chainId = config.chainId ?? 5_042_002;
    this.timeoutMs = config.timeoutMs ?? 10_000;
  }

  /**
   * Authenticate a user via social login (Google, Apple, email) and
   * create or restore a Circle Embedded Wallet.
   *
   * Rate limited to 5 failed attempts per 15-minute window per user token.
   */
  async authenticate(
    provider: AuthProvider,
    credentials: AuthCredentials,
  ): Promise<WalletSession> {
    const rateLimitKey = `${provider}:${credentials.token}`;

    this.enforceRateLimit(rateLimitKey);

    try {
      const response = await this.fetchWithTimeout<{
        userId: string;
        walletAddress: string;
        expiresAt: number;
      }>('/wallets/authenticate', {
        method: 'POST',
        body: JSON.stringify({
          provider,
          token: credentials.token,
          chainId: this.chainId,
        }),
      });

      // Successful auth — reset failed attempts for this key
      this.failedAttempts.delete(rateLimitKey);

      return {
        userId: response.userId,
        walletAddress: response.walletAddress as `0x${string}`,
        chainId: this.chainId,
        expiresAt: response.expiresAt,
      };
    } catch (error) {
      if (error instanceof TimeoutError || error instanceof RateLimitError) {
        throw error;
      }

      // Record failed attempt for rate limiting
      this.recordFailedAttempt(rateLimitKey);

      throw new AuthenticationError(
        error instanceof Error ? error.message : 'Authentication failed',
        provider,
        error,
      );
    }
  }

  /**
   * Fetch wallet address and token balances for an authenticated session.
   */
  async getWalletInfo(session: WalletSession): Promise<WalletInfo> {
    const response = await this.fetchWithTimeout<{
      address: string;
      balances: Record<string, string>;
      chainId: number;
    }>(`/wallets/${session.walletAddress}/info`, {
      method: 'GET',
      headers: {
        'X-User-Session': session.userId,
      },
    });

    // Convert string balances to bigint
    const balances: Record<string, bigint> = {};
    for (const [asset, balance] of Object.entries(response.balances)) {
      balances[asset] = BigInt(balance);
    }

    return {
      address: response.address as `0x${string}`,
      balances,
      chainId: response.chainId,
    };
  }

  /**
   * Sign an ERC-4337 UserOperation using Circle's MPC key management.
   */
  async signUserOperation(
    session: WalletSession,
    userOp: UserOperation,
  ): Promise<SignedUserOperation> {
    const response = await this.fetchWithTimeout<{
      signature: string;
    }>('/wallets/sign-user-operation', {
      method: 'POST',
      headers: {
        'X-User-Session': session.userId,
      },
      body: JSON.stringify({
        walletAddress: session.walletAddress,
        chainId: session.chainId,
        userOperation: {
          sender: userOp.sender,
          nonce: userOp.nonce.toString(),
          initCode: userOp.initCode,
          callData: userOp.callData,
          callGasLimit: userOp.callGasLimit.toString(),
          verificationGasLimit: userOp.verificationGasLimit.toString(),
          preVerificationGas: userOp.preVerificationGas.toString(),
          maxFeePerGas: userOp.maxFeePerGas.toString(),
          maxPriorityFeePerGas: userOp.maxPriorityFeePerGas.toString(),
          paymasterAndData: userOp.paymasterAndData,
        },
      }),
    });

    return {
      ...userOp,
      signature: response.signature as `0x${string}`,
    };
  }

  /**
   * Restore an existing wallet for a returning user.
   */
  async restoreWallet(session: WalletSession): Promise<WalletInfo> {
    const response = await this.fetchWithTimeout<{
      address: string;
      balances: Record<string, string>;
      chainId: number;
    }>(`/wallets/${session.walletAddress}/restore`, {
      method: 'GET',
      headers: {
        'X-User-Session': session.userId,
      },
    });

    const balances: Record<string, bigint> = {};
    for (const [asset, balance] of Object.entries(response.balances)) {
      balances[asset] = BigInt(balance);
    }

    return {
      address: response.address as `0x${string}`,
      balances,
      chainId: response.chainId,
    };
  }

  // ─── Rate Limiting Helpers ──────────────────────────────────────────────

  /**
   * Check if the user has exceeded the rate limit.
   * Throws RateLimitError if max attempts reached within the window.
   */
  private enforceRateLimit(key: string): void {
    const entry = this.failedAttempts.get(key);
    if (!entry) return;

    const now = Date.now();
    const windowEnd = entry.windowStart + RATE_LIMIT_WINDOW_MS;

    // Window expired — clear the entry
    if (now >= windowEnd) {
      this.failedAttempts.delete(key);
      return;
    }

    // Within window and at or above limit
    if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) {
      const retryAfterMs = windowEnd - now;
      throw new RateLimitError(retryAfterMs);
    }
  }

  /**
   * Record a failed authentication attempt for rate limiting.
   */
  private recordFailedAttempt(key: string): void {
    const now = Date.now();
    const entry = this.failedAttempts.get(key);

    if (!entry || now >= entry.windowStart + RATE_LIMIT_WINDOW_MS) {
      // Start a new window
      this.failedAttempts.set(key, { count: 1, windowStart: now });
    } else {
      // Increment within existing window
      entry.count += 1;
    }
  }

  // ─── HTTP Helpers ─────────────────────────────────────────────────────────

  /**
   * Make an HTTP request to the Circle API with a timeout.
   * Throws TimeoutError if the request exceeds the configured timeout.
   */
  private async fetchWithTimeout<T>(
    path: string,
    options: RequestInit & { headers?: Record<string, string> },
  ): Promise<T> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    const url = `${this.baseUrl}${path}`;
    const operationName = `${options.method ?? 'GET'} ${path}`;

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => 'Unknown error');
        throw new Error(
          `Circle API error (${response.status}): ${errorBody}`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new TimeoutError(operationName, this.timeoutMs);
      }
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
