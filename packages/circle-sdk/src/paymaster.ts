/**
 * Circle Paymaster Module
 *
 * Implements IPaymasterModule for gas sponsorship via Circle Paymaster.
 * Handles fee estimation, paymaster data injection into UserOperations,
 * and service availability checks.
 */

import type {
  GasFeeEstimate,
  IPaymasterModule,
  PaymasterData,
  UserOperation,
} from './types';

// ─── Fee Bounds (USDC 6-decimal format) ─────────────────────────────────────

/** Minimum USDC fee: 0.01 USDC = 10_000 units (6 decimals) */
export const MIN_FEE_USDC = 10_000n;

/** Maximum USDC fee: 0.05 USDC = 50_000 units (6 decimals) */
export const MAX_FEE_USDC = 50_000n;

// ─── Typed Errors ───────────────────────────────────────────────────────────

/**
 * Thrown when the Circle Paymaster service is unreachable or unhealthy.
 * Frontend should present fallback UX (pay gas in ARC_Token directly).
 */
export class PaymasterUnavailableError extends Error {
  public readonly code = 'PAYMASTER_UNAVAILABLE' as const;

  constructor(message = 'Circle Paymaster service is unavailable') {
    super(message);
    this.name = 'PaymasterUnavailableError';
  }
}

/**
 * Thrown when the user's USDC balance is insufficient to cover the gas fee.
 * Frontend should display the minimum balance required.
 */
export class InsufficientFeeBalanceError extends Error {
  public readonly code = 'INSUFFICIENT_FEE_BALANCE' as const;
  public readonly requiredFee: bigint;
  public readonly availableBalance: bigint;

  constructor(requiredFee: bigint, availableBalance: bigint) {
    super(
      `Insufficient USDC balance for gas fee. Required: ${requiredFee}, available: ${availableBalance}`,
    );
    this.name = 'InsufficientFeeBalanceError';
    this.requiredFee = requiredFee;
    this.availableBalance = availableBalance;
  }
}

/**
 * Thrown when the estimated fee falls outside the valid bounds [0.01, 0.05] USDC.
 * Indicates an unexpected response from the paymaster endpoint.
 */
export class FeeBoundsError extends Error {
  public readonly code = 'FEE_OUT_OF_BOUNDS' as const;
  public readonly fee: bigint;
  public readonly minFee: bigint;
  public readonly maxFee: bigint;

  constructor(fee: bigint) {
    super(
      `Gas fee ${fee} is outside valid bounds [${MIN_FEE_USDC}, ${MAX_FEE_USDC}]`,
    );
    this.name = 'FeeBoundsError';
    this.fee = fee;
    this.minFee = MIN_FEE_USDC;
    this.maxFee = MAX_FEE_USDC;
  }
}

// ─── Paymaster Module Implementation ────────────────────────────────────────

export interface PaymasterModuleConfig {
  /** Circle Paymaster endpoint URL */
  paymasterUrl: string;
  /** Request timeout in milliseconds (default: 10_000) */
  timeout?: number;
}

/**
 * PaymasterModule wraps the Circle Paymaster endpoint to provide
 * gas sponsorship for ERC-4337 UserOperations on Arc Network.
 *
 * Fees are deducted in USDC (0.01–0.05 range) from the user's balance.
 */
export class PaymasterModule implements IPaymasterModule {
  private readonly paymasterUrl: string;
  private readonly timeout: number;

  constructor(config: PaymasterModuleConfig) {
    this.paymasterUrl = config.paymasterUrl;
    this.timeout = config.timeout ?? 10_000;
  }

  /**
   * Estimate the USDC gas fee for sponsoring a UserOperation.
   *
   * Calls the Circle Paymaster endpoint with the UserOp to get a fee estimate,
   * then validates the fee is within the acceptable bounds [0.01, 0.05] USDC.
   *
   * @throws {PaymasterUnavailableError} If the paymaster endpoint is unreachable
   * @throws {FeeBoundsError} If the returned fee is outside valid bounds
   */
  async estimateGasFee(userOp: UserOperation): Promise<GasFeeEstimate> {
    const response = await this.postToPaymaster('/estimate', {
      userOperation: serializeUserOp(userOp),
    });

    const estimate: GasFeeEstimate = {
      usdcFee: BigInt(response.usdcFee as string),
      gasEstimate: BigInt(response.gasEstimate as string),
      maxFeePerGas: BigInt(response.maxFeePerGas as string),
    };

    // Validate fee bounds
    if (estimate.usdcFee < MIN_FEE_USDC || estimate.usdcFee > MAX_FEE_USDC) {
      throw new FeeBoundsError(estimate.usdcFee);
    }

    return estimate;
  }

  /**
   * Fetch paymaster sponsorship data to inject into a UserOperation.
   *
   * The returned PaymasterData fields should be merged into the UserOperation
   * before signing and submission to the bundler.
   *
   * @throws {PaymasterUnavailableError} If the paymaster endpoint is unreachable
   */
  async getPaymasterData(userOp: UserOperation): Promise<PaymasterData> {
    const response = await this.postToPaymaster('/sponsor', {
      userOperation: serializeUserOp(userOp),
    });

    return {
      paymaster: response.paymaster as `0x${string}`,
      paymasterData: response.paymasterData as `0x${string}`,
      paymasterVerificationGasLimit: BigInt(
        response.paymasterVerificationGasLimit as string,
      ),
      paymasterPostOpGasLimit: BigInt(
        response.paymasterPostOpGasLimit as string,
      ),
    };
  }

  /**
   * Health check for the Circle Paymaster service.
   *
   * @returns true if the service is reachable and healthy, false otherwise
   */
  async isAvailable(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(`${this.paymasterUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response.ok;
    } catch {
      return false;
    }
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  /**
   * POST to the paymaster endpoint with timeout and error handling.
   */
  private async postToPaymaster(
    path: string,
    body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    let response: Response;
    try {
      response = await fetch(`${this.paymasterUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error: unknown) {
      clearTimeout(timeoutId);
      throw new PaymasterUnavailableError(
        error instanceof Error
          ? `Paymaster request failed: ${error.message}`
          : 'Paymaster request failed',
      );
    }

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new PaymasterUnavailableError(
        `Paymaster returned HTTP ${response.status}`,
      );
    }

    return (await response.json()) as Record<string, unknown>;
  }
}

// ─── Utility ────────────────────────────────────────────────────────────────

/**
 * Serialize a UserOperation's bigint fields to strings for JSON transport.
 */
function serializeUserOp(
  userOp: UserOperation,
): Record<string, string> {
  return {
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
  };
}
