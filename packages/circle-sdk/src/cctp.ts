/**
 * CCTP/Gateway Module — Cross-chain USDC transfers via Circle's
 * Cross-Chain Transfer Protocol V2 and Gateway pre-crediting.
 *
 * Supports burning USDC on Arbitrum and minting on Arc Network.
 */

import type {
  CrossChainTransferParams,
  ICCTPModule,
  TransferPhase,
  TransferStatus,
} from './types';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum transfer amount: 1 USDC (6 decimals). */
const MIN_TRANSFER_AMOUNT = 1_000_000n;

/** Maximum transfer amount: 10,000,000 USDC (6 decimals). */
const MAX_TRANSFER_AMOUNT = 10_000_000_000_000n;

/** Transfer timeout: 30 minutes in milliseconds. */
const TRANSFER_TIMEOUT_MS = 1_800_000;

/** Arc Network CCTP domain identifier. */
const ARC_CCTP_DOMAIN = 26;

/** Arc Testnet chain ID. */
const ARC_CHAIN_ID = 5042002;

/** Arbitrum CCTP domain identifier. */
const ARBITRUM_CCTP_DOMAIN = 3;

// ─── Contract Addresses (Arc Testnet) ───────────────────────────────────────

const ARC_CONTRACTS = {
  tokenMessengerV2: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA' as const,
  messageTransmitterV2: '0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275' as const,
  gatewayWallet: '0x0077777d7EBA4688BDeF3E311b846F25870A19B9' as const,
  gatewayMinter: '0x0022222ABE238Cc2C7Bb1f21003F0a260052475B' as const,
} as const;

// ─── Errors ─────────────────────────────────────────────────────────────────

/** Thrown when a transfer exceeds the 30-minute timeout. */
export class TransferTimeoutError extends Error {
  public readonly transferId: string;
  public readonly elapsedMs: number;

  constructor(transferId: string, elapsedMs: number) {
    super(
      `Transfer ${transferId} timed out after ${Math.round(elapsedMs / 1000)}s (limit: ${TRANSFER_TIMEOUT_MS / 1000}s)`,
    );
    this.name = 'TransferTimeoutError';
    this.transferId = transferId;
    this.elapsedMs = elapsedMs;
  }
}

/** Thrown when the transfer amount is outside the valid range [1 USDC, 10M USDC]. */
export class AmountBoundsError extends Error {
  public readonly amount: bigint;
  public readonly min: bigint;
  public readonly max: bigint;

  constructor(amount: bigint) {
    super(
      `Transfer amount ${amount} is outside valid bounds [${MIN_TRANSFER_AMOUNT}, ${MAX_TRANSFER_AMOUNT}]`,
    );
    this.name = 'AmountBoundsError';
    this.amount = amount;
    this.min = MIN_TRANSFER_AMOUNT;
    this.max = MAX_TRANSFER_AMOUNT;
  }
}

/** Thrown when a transfer fails for reasons other than timeout. */
export class TransferFailedError extends Error {
  public readonly transferId: string;
  public readonly reason: string;

  constructor(transferId: string, reason: string) {
    super(`Transfer ${transferId} failed: ${reason}`);
    this.name = 'TransferFailedError';
    this.transferId = transferId;
    this.reason = reason;
  }
}

// ─── Configuration ──────────────────────────────────────────────────────────

/** Configuration for the CCTP module. */
export interface CCTPModuleConfig {
  /** URL of the Circle attestation service for polling transfer status. */
  attestationServiceUrl: string;
  /** URL of the Circle Gateway service for pre-credited balances. */
  gatewayUrl: string;
  /** RPC URL for the source chain (Arbitrum). */
  sourceChainRpc: string;
}

// ─── Implementation ─────────────────────────────────────────────────────────

/**
 * CCTPModule implements cross-chain USDC transfers using Circle's CCTP V2
 * protocol with Gateway pre-crediting on Arc Network.
 */
export class CCTPModule implements ICCTPModule {
  private readonly config: CCTPModuleConfig;
  private readonly transferTimestamps: Map<string, number> = new Map();

  constructor(config: CCTPModuleConfig) {
    this.config = config;
  }

  /**
   * Initiate a cross-chain USDC transfer from Arbitrum to Arc Network.
   *
   * Validates amount bounds, invokes CCTP V2 burn on the source chain,
   * and returns a TransferStatus with phase tracking.
   */
  async initiateTransfer(
    params: CrossChainTransferParams,
  ): Promise<TransferStatus> {
    // Validate amount bounds
    if (params.amount < MIN_TRANSFER_AMOUNT || params.amount > MAX_TRANSFER_AMOUNT) {
      throw new AmountBoundsError(params.amount);
    }

    // Generate a unique transfer ID
    const transferId = this.generateTransferId(params);

    // Record initiation timestamp for timeout tracking
    const now = Date.now();
    this.transferTimestamps.set(transferId, now);

    // Invoke CCTP V2 burn on Arbitrum (source chain)
    await this.invokeCCTPBurn(params, transferId);

    // Estimated completion: ~20 minutes for typical CCTP finality
    const estimatedCompletion = Math.floor(now / 1000) + 20 * 60;

    const status: TransferStatus = {
      transferId,
      phase: 'initiated',
      amount: params.amount,
      sourceChain: params.sourceChain,
      estimatedCompletion,
    };

    return status;
  }

  /**
   * Poll the Circle attestation service for the current transfer phase.
   *
   * Checks for timeout (30 minutes) and returns the current phase.
   * If the transfer has timed out, marks it as failed and throws.
   */
  async getTransferStatus(transferId: string): Promise<TransferPhase> {
    // Check for timeout
    const initiatedAt = this.transferTimestamps.get(transferId);
    if (initiatedAt !== undefined) {
      const elapsed = Date.now() - initiatedAt;
      if (elapsed > TRANSFER_TIMEOUT_MS) {
        // Clean up and mark as failed
        this.transferTimestamps.delete(transferId);
        throw new TransferTimeoutError(transferId, elapsed);
      }
    }

    // Poll attestation service for current phase
    const phase = await this.pollAttestationService(transferId);

    // Clean up tracking on terminal states
    if (phase === 'confirmed' || phase === 'failed') {
      this.transferTimestamps.delete(transferId);
    }

    if (phase === 'failed') {
      throw new TransferFailedError(transferId, 'Transfer failed during attestation');
    }

    return phase;
  }

  /**
   * Query the Circle Gateway for the pre-credited balance on Arc Network.
   *
   * Pre-credited balances are available within ~30 seconds of transfer
   * initiation but are NOT available for borrowing or withdrawal until
   * CCTP finality is confirmed.
   */
  async getPreCreditedBalance(userAddress: string): Promise<bigint> {
    const response = await fetch(
      `${this.config.gatewayUrl}/v1/balances/${userAddress}/pre-credited`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new TransferFailedError(
        'unknown',
        `Failed to query pre-credited balance: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { balance: string };
    return BigInt(data.balance);
  }

  // ─── Private Methods ────────────────────────────────────────────────────

  /**
   * Generate a deterministic transfer ID from the transfer parameters.
   */
  private generateTransferId(params: CrossChainTransferParams): string {
    const timestamp = Date.now();
    const raw = `${params.sourceChain}-${params.recipient}-${params.amount.toString()}-${timestamp.toString()}`;
    // Simple hash-like ID generation (in production, use the on-chain nonce/message hash)
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return `cctp-${Math.abs(hash).toString(16).padStart(8, '0')}-${timestamp.toString(16)}`;
  }

  /**
   * Invoke the CCTP V2 burn transaction on the source chain (Arbitrum).
   *
   * Calls TokenMessengerV2.depositForBurn() to burn USDC on Arbitrum
   * with Arc Network (domain 26) as the destination.
   */
  private async invokeCCTPBurn(
    params: CrossChainTransferParams,
    _transferId: string,
  ): Promise<void> {
    // Construct the CCTP V2 depositForBurn call
    // In production, this would use viem/ethers to send the transaction
    const burnPayload = {
      method: 'depositForBurn',
      contract: ARC_CONTRACTS.tokenMessengerV2,
      params: {
        amount: params.amount.toString(),
        destinationDomain: ARC_CCTP_DOMAIN,
        mintRecipient: params.recipient,
        burnToken: 'USDC', // Resolved to actual address on source chain
      },
      sourceChainRpc: this.config.sourceChainRpc,
      sourceDomain: ARBITRUM_CCTP_DOMAIN,
    };

    const response = await fetch(`${this.config.sourceChainRpc}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_sendTransaction',
        params: [burnPayload],
      }),
    });

    if (!response.ok) {
      throw new TransferFailedError(
        _transferId,
        `CCTP burn transaction failed: ${response.status} ${response.statusText}`,
      );
    }
  }

  /**
   * Poll the Circle attestation service for the current transfer phase.
   */
  private async pollAttestationService(transferId: string): Promise<TransferPhase> {
    const response = await fetch(
      `${this.config.attestationServiceUrl}/v1/attestations/${transferId}`,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      },
    );

    if (!response.ok) {
      // If attestation not found yet, transfer is still in early phase
      if (response.status === 404) {
        return 'burning';
      }
      throw new TransferFailedError(
        transferId,
        `Attestation service error: ${response.status} ${response.statusText}`,
      );
    }

    const data = (await response.json()) as { status: string };

    return this.mapAttestationStatus(data.status);
  }

  /**
   * Map attestation service status strings to TransferPhase values.
   */
  private mapAttestationStatus(status: string): TransferPhase {
    switch (status) {
      case 'pending_confirmations':
        return 'burning';
      case 'complete':
        return 'in-transit';
      case 'minting':
        return 'minting';
      case 'finalized':
        return 'confirmed';
      case 'failed':
        return 'failed';
      default:
        return 'initiated';
    }
  }
}
