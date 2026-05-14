'use client';

/**
 * useWalletAccount — Bridges Circle Embedded Wallet session into wagmi-compatible state.
 *
 * This hook replaces direct usage of wagmi's `useAccount()` throughout the app.
 * It returns the Circle wallet address and connection state so that all protocol
 * hooks (useReadContract, useReadContracts, etc.) can use the correct address
 * without requiring a traditional EOA connector (MetaMask, injected, etc.).
 *
 * Why not a custom wagmi connector?
 * Circle Embedded Wallets use ERC-4337 (account abstraction) with server-side
 * signing. They don't expose a standard EIP-1193 provider, so a wagmi connector
 * would need to fake the entire provider interface. Instead, we bridge at the
 * hook level — simpler, more maintainable, and works with wagmi's read-only
 * contract calls via the public client transport.
 */

import { useWallet } from '../contexts/WalletContext';

export interface WalletAccountResult {
  /** The connected wallet address (from Circle session) */
  address: `0x${string}` | undefined;
  /** Whether the wallet is connected (Circle session exists with a valid address) */
  isConnected: boolean;
  /** Whether the wallet connection is still loading */
  isConnecting: boolean;
  /** Chain ID of the connected wallet */
  chainId: number | undefined;
}

/**
 * Hook that provides wallet account state from the Circle Embedded Wallet session.
 * Drop-in replacement for wagmi's `useAccount()` in the context of ArcLend.
 *
 * Usage:
 * ```ts
 * // Before:
 * const { address, isConnected } = useAccount();
 *
 * // After:
 * const { address, isConnected } = useWalletAccount();
 * ```
 */
export function useWalletAccount(): WalletAccountResult {
  const { session, walletInfo, isLoading } = useWallet();

  const address = walletInfo?.address ?? (session?.walletAddress as `0x${string}` | undefined);
  const isConnected = !!session && !!address;
  const chainId = walletInfo?.chainId ?? (isConnected ? 5042002 : undefined);

  return {
    address: isConnected ? address : undefined,
    isConnected,
    isConnecting: isLoading,
    chainId,
  };
}
