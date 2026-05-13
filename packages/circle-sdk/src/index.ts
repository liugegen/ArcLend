/**
 * @arclend/circle-sdk
 *
 * TypeScript wrappers for Circle Embedded Wallets, Paymaster, and CCTP.
 */

export type {
  // Authentication
  AuthProvider,
  AuthCredentials,

  // Embedded Wallet
  WalletSession,
  WalletInfo,

  // ERC-4337 UserOperation
  UserOperation,
  SignedUserOperation,

  // Paymaster
  GasFeeEstimate,
  PaymasterData,

  // CCTP / Cross-Chain
  CrossChainTransferParams,
  TransferPhase,
  TransferStatus,

  // Module interfaces
  IEmbeddedWalletModule,
  IPaymasterModule,
  ICCTPModule,
} from './types.js';

// CCTP Module
export {
  CCTPModule,
  TransferTimeoutError,
  AmountBoundsError,
  TransferFailedError,
} from './cctp.js';
export type { CCTPModuleConfig } from './cctp.js';

// Paymaster module
export {
  PaymasterModule,
  PaymasterUnavailableError,
  InsufficientFeeBalanceError,
  FeeBoundsError,
  MIN_FEE_USDC,
  MAX_FEE_USDC,
} from './paymaster.js';
export type { PaymasterModuleConfig } from './paymaster.js';

// Embedded Wallet module
export {
  EmbeddedWalletModule,
  AuthenticationError,
  TimeoutError,
  RateLimitError,
} from './embeddedWallet.js';
export type { EmbeddedWalletConfig } from './embeddedWallet.js';
