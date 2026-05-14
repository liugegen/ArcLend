'use client';

/**
 * Root Providers for ArcLend
 *
 * Wraps the application with:
 * - WagmiProvider (Arc Network chain config)
 * - QueryClientProvider (React Query for data fetching)
 * - WalletProvider (Circle Web SDK authentication)
 *
 * MIGRATION NOTE:
 * Authentication is now handled by WalletContext using the official
 * @circle-fin/w3s-pw-web-sdk. The useCircleSDK hook still provides
 * Paymaster and CCTP modules for transaction operations.
 */

import { type ReactNode, createContext, useContext } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defineChain } from 'viem';

import type { PaymasterModule, CCTPModule } from '@arclend/circle-sdk';
import { paymasterModule, cctpModule } from '../lib/circleClient';
import { WalletProvider } from '../contexts/WalletContext';

// ─── Arc Network Chain Definition ───────────────────────────────────────────

const ARC_TESTNET_RPC =
  process.env.NEXT_PUBLIC_ARC_TESTNET_RPC_URL ?? 'https://rpc.testnet.arc.network';

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: 6,
  },
  rpcUrls: {
    default: {
      http: [ARC_TESTNET_RPC],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app',
    },
  },
  testnet: true,
});

// ─── Wagmi Config ───────────────────────────────────────────────────────────

const wagmiConfig = createConfig({
  chains: [arcTestnet],
  transports: {
    [arcTestnet.id]: http(ARC_TESTNET_RPC),
  },
});

// ─── React Query Client ─────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      refetchInterval: 15_000,
    },
  },
});

// ─── Circle SDK Context (Paymaster + CCTP only) ─────────────────────────────

interface CircleSDKContextValue {
  paymaster: PaymasterModule;
  cctp: CCTPModule;
}

const CircleSDKContext = createContext<CircleSDKContextValue | null>(null);

/**
 * Hook to access Circle SDK module instances (Paymaster, CCTP).
 * Authentication is handled separately by useWallet() from WalletContext.
 */
export function useCircleSDK(): CircleSDKContextValue {
  const context = useContext(CircleSDKContext);
  if (!context) {
    throw new Error('useCircleSDK must be used within a Providers component');
  }
  return context;
}

// ─── Providers Component ────────────────────────────────────────────────────

interface ProvidersProps {
  children: ReactNode;
}

/**
 * Root providers wrapping the application.
 * Authentication is handled by WalletProvider using the Circle Web SDK.
 */
export function Providers({ children }: ProvidersProps) {
  const circleSDKValue: CircleSDKContextValue = {
    paymaster: paymasterModule,
    cctp: cctpModule,
  };

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <CircleSDKContext.Provider value={circleSDKValue}>
          <WalletProvider>{children}</WalletProvider>
        </CircleSDKContext.Provider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
