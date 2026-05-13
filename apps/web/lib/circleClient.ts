/**
 * Circle SDK client initialization for ArcLend.
 *
 * Exports pre-configured instances of the EmbeddedWallet, Paymaster,
 * and CCTP modules for use throughout the frontend.
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

const CIRCLE_API_KEY = process.env.NEXT_PUBLIC_CIRCLE_API_KEY ?? '';
const CIRCLE_API_URL =
  process.env.NEXT_PUBLIC_CIRCLE_API_URL ?? 'https://api.circle.com';

const ARC_TESTNET_CHAIN_ID = 5042002;
const ARC_TESTNET_RPC = 'https://rpc.testnet.arc.network';

// ─── Embedded Wallet Module ─────────────────────────────────────────────────

const embeddedWalletConfig: EmbeddedWalletConfig = {
  baseUrl: CIRCLE_API_URL,
  apiKey: CIRCLE_API_KEY,
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
