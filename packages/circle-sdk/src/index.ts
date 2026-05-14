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
} from './types';

// CCTP Module
export {
  CCTPModule,
  TransferTimeoutError,
  AmountBoundsError,
  TransferFailedError,
} from './cctp';
export type { CCTPModuleConfig } from './cctp';

// Paymaster module
export {
  PaymasterModule,
  PaymasterUnavailableError,
  InsufficientFeeBalanceError,
  FeeBoundsError,
  MIN_FEE_USDC,
  MAX_FEE_USDC,
} from './paymaster';
export type { PaymasterModuleConfig } from './paymaster';

// Embedded Wallet module
export {
  EmbeddedWalletModule,
  AuthenticationError,
  TimeoutError,
  RateLimitError,
} from './embeddedWallet';
export type { EmbeddedWalletConfig } from './embeddedWallet';
