/**
 * Circle SDK TypeScript type definitions for ArcLend protocol.
 *
 * Covers Embedded Wallets, Paymaster, and CCTP/Gateway modules.
 */

// ─── Authentication ─────────────────────────────────────────────────────────

/** Supported social login / email authentication providers. */
export type AuthProvider = 'google' | 'apple' | 'email';

/** Credentials passed to the authentication flow. */
export interface AuthCredentials {
  provider: AuthProvider;
  token: string;
}

// ─── Embedded Wallet Types ──────────────────────────────────────────────────

/** Session returned after successful wallet authentication. */
export interface WalletSession {
  userId: string;
  walletAddress: `0x${string}`;
  chainId: number;
  expiresAt: number;
}

/** Wallet information including on-chain balances. */
export interface WalletInfo {
  address: `0x${string}`;
  balances: Record<string, bigint>; // asset address → balance
  chainId: number;
}

// ─── ERC-4337 UserOperation Types ───────────────────────────────────────────

/** Unsigned ERC-4337 UserOperation. */
export interface UserOperation {
  sender: `0x${string}`;
  nonce: bigint;
  initCode: `0x${string}`;
  callData: `0x${string}`;
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
  paymasterAndData: `0x${string}`;
}

/** Signed ERC-4337 UserOperation (includes signature). */
export interface SignedUserOperation extends UserOperation {
  signature: `0x${string}`;
}

// ─── Paymaster Types ────────────────────────────────────────────────────────

/** Gas fee estimate returned by the Paymaster module. */
export interface GasFeeEstimate {
  usdcFee: bigint;       // Fee in USDC (6 decimals)
  gasEstimate: bigint;   // Estimated gas units
  maxFeePerGas: bigint;  // Current gas price
}

/** Paymaster sponsorship data to inject into a UserOperation. */
export interface PaymasterData {
  paymaster: `0x${string}`;
  paymasterData: `0x${string}`;
  paymasterVerificationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
}

// ─── CCTP / Cross-Chain Transfer Types ──────────────────────────────────────

/** Parameters for initiating a cross-chain USDC transfer. */
export interface CrossChainTransferParams {
  sourceChain: 'arbitrum';
  amount: bigint;           // USDC amount (6 decimals)
  recipient: `0x${string}`; // Destination address on Arc Network
}

/** Phases a cross-chain transfer progresses through. */
export type TransferPhase =
  | 'initiated'
  | 'burning'
  | 'in-transit'
  | 'minting'
  | 'confirmed'
  | 'failed';

/** Status of a cross-chain transfer. */
export interface TransferStatus {
  transferId: string;
  phase: TransferPhase;
  amount: bigint;
  sourceChain: string;
  estimatedCompletion: number; // Unix timestamp
}

// ─── Module Interfaces ──────────────────────────────────────────────────────

/** Embedded Wallet module — social login wallet creation and signing. */
export interface IEmbeddedWalletModule {
  /** Authenticate and create/restore a wallet via social login. */
  authenticate(
    provider: AuthProvider,
    credentials: AuthCredentials,
  ): Promise<WalletSession>;

  /** Get wallet address and token balances. */
  getWalletInfo(session: WalletSession): Promise<WalletInfo>;

  /** Sign an ERC-4337 UserOperation. */
  signUserOperation(
    session: WalletSession,
    userOp: UserOperation,
  ): Promise<SignedUserOperation>;

  /** Restore an existing wallet for returning users. */
  restoreWallet(session: WalletSession): Promise<WalletInfo>;
}

/** Paymaster module — gas sponsorship via Circle Paymaster. */
export interface IPaymasterModule {
  /** Estimate the USDC fee for gas sponsorship. */
  estimateGasFee(userOp: UserOperation): Promise<GasFeeEstimate>;

  /** Get paymaster data to include in a UserOperation. */
  getPaymasterData(userOp: UserOperation): Promise<PaymasterData>;

  /** Check if the paymaster service is available. */
  isAvailable(): Promise<boolean>;
}

/** CCTP/Gateway module — cross-chain USDC transfers. */
export interface ICCTPModule {
  /** Initiate a cross-chain USDC transfer from a source chain. */
  initiateTransfer(
    params: CrossChainTransferParams,
  ): Promise<TransferStatus>;

  /** Poll the current transfer status/phase. */
  getTransferStatus(transferId: string): Promise<TransferPhase>;

  /** Get the pre-credited balance from Gateway (before CCTP finality). */
  getPreCreditedBalance(userAddress: string): Promise<bigint>;
}
