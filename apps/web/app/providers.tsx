'use client';

import { type ReactNode, createContext, useContext } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defineChain } from 'viem';

import type { EmbeddedWalletModule, PaymasterModule, CCTPModule } from '@arclend/circle-sdk';
import {
  embeddedWalletModule,
  paymasterModule,
  cctpModule,
} from '../lib/circleClient';
import { WalletProvider } from '../contexts/WalletContext';

// ─── Arc Network Chain Definition ───────────────────────────────────────────

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
      http: ['https://rpc.testnet.arc.network'],
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
    [arcTestnet.id]: http('https://rpc.testnet.arc.network'),
  },
});

// ─── React Query Client ─────────────────────────────────────────────────────

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000, // 15 seconds — matches rate refresh requirement
      refetchInterval: 15_000,
    },
  },
});

// ─── Circle SDK Context ─────────────────────────────────────────────────────

interface CircleSDKContextValue {
  embeddedWallet: EmbeddedWalletModule;
  paymaster: PaymasterModule;
  cctp: CCTPModule;
}

const CircleSDKContext = createContext<CircleSDKContextValue | null>(null);

/**
 * Hook to access Circle SDK module instances.
 * Must be used within a Providers component.
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
 * Root providers wrapping the application with:
 * - WagmiProvider (Arc Network chain config)
 * - QueryClientProvider (React Query)
 * - CircleSDKContext (EmbeddedWallet, Paymaster, CCTP modules)
 */
export function Providers({ children }: ProvidersProps) {
  const circleSDKValue: CircleSDKContextValue = {
    embeddedWallet: embeddedWalletModule,
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
