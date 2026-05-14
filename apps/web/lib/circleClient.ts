/**
 * Circle SDK client initialization for ArcLend.
 *
 * MIGRATION NOTE:
 * Authentication is now handled by the Circle Web SDK (@circle-fin/w3s-pw-web-sdk)
 * in WalletContext.tsx. The EmbeddedWalletModule here is retained ONLY for
 * transaction signing operations (signUserOperation), NOT for authentication.
 *
 * The CIRCLE_API_KEY is no longer used client-side for auth. It's only used
 * server-side in /api/circle/route.ts.
 */

import {
  EmbeddedWalletModule,
  PaymasterModule,
  CCTPModule,
} from '@arclend/circle-sdk';

import type {
  EmbeddedWalletConfig,
  PaymasterModuleConfig,
  CCTPModuleConfig,
} from '@arclend/circle-sdk';

// ─── Configuration ──────────────────────────────────────────────────────────

const CIRCLE_API_URL =
  process.env.NEXT_PUBLIC_CIRCLE_API_URL ?? 'https://api.circle.com';

const ARC_TESTNET_CHAIN_ID = 5042002;

// ─── Embedded Wallet Module (for transaction signing only) ──────────────────
// NOTE: This module is used for signUserOperation() calls, NOT for authentication.
// Authentication uses the @circle-fin/w3s-pw-web-sdk directly.

const embeddedWalletConfig: EmbeddedWalletConfig = {
  baseUrl: CIRCLE_API_URL,
  apiKey: '', // Not used for client-side signing — server handles auth
  chainId: ARC_TESTNET_CHAIN_ID,
  timeoutMs: 10_000,
};

export const embeddedWalletModule = new EmbeddedWalletModule(
  embeddedWalletConfig,
);

// ─── Paymaster Module ───────────────────────────────────────────────────────

const paymasterConfig: PaymasterModuleConfig = {
  paymasterUrl: `${CIRCLE_API_URL}/v1/paymaster`,
  timeout: 10_000,
};

export const paymasterModule = new PaymasterModule(paymasterConfig);

// ─── CCTP Module ────────────────────────────────────────────────────────────

const cctpConfig: CCTPModuleConfig = {
  attestationServiceUrl: `${CIRCLE_API_URL}/v1/attestations`,
  gatewayUrl: `${CIRCLE_API_URL}/v1/gateway`,
  sourceChainRpc: 'https://arb1.arbitrum.io/rpc',
};

export const cctpModule = new CCTPModule(cctpConfig);
