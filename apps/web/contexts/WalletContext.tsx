'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { AuthProvider, WalletInfo, WalletSession } from '@arclend/circle-sdk';
import {
  AuthenticationError,
  TimeoutError,
  RateLimitError,
} from '@arclend/circle-sdk';

import { useCircleSDK } from '../app/providers';

// ─── Constants ──────────────────────────────────────────────────────────────

const SESSION_STORAGE_KEY = 'arclend_session';

// ─── Types ──────────────────────────────────────────────────────────────────

interface WalletError {
  message: string;
  type: 'auth' | 'timeout' | 'rate_limit' | 'unknown';
  retryAfterMs?: number;
}

interface WalletContextValue {
  session: WalletSession | null;
  walletInfo: WalletInfo | null;
  isLoading: boolean;
  error: WalletError | null;
  login: (provider: AuthProvider) => Promise<void>;
  logout: () => void;
}

// ─── Context ────────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const { embeddedWallet } = useCircleSDK();

  const [session, setSession] = useState<WalletSession | null>(null);
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<WalletError | null>(null);

  // Track if we've already attempted session restoration
  const restorationAttempted = useRef(false);

  // ─── Session Persistence ────────────────────────────────────────────────

  const persistSession = useCallback((walletSession: WalletSession) => {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(walletSession));
    } catch {
      // localStorage may be unavailable (e.g., private browsing)
    }
  }, []);

  const clearPersistedSession = useCallback(() => {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // Ignore storage errors
    }
  }, []);

  const loadPersistedSession = useCallback((): WalletSession | null => {
    try {
      const stored = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!stored) return null;

      const parsed = JSON.parse(stored) as WalletSession;

      // Check if session has expired
      if (parsed.expiresAt < Date.now()) {
        localStorage.removeItem(SESSION_STORAGE_KEY);
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }, []);

  // ─── Error Mapping ──────────────────────────────────────────────────────

  const mapError = useCallback((err: unknown): WalletError => {
    if (err instanceof RateLimitError) {
      return {
        message: `Too many failed attempts. Please try again in ${Math.ceil(err.retryAfterMs / 1000)} seconds.`,
        type: 'rate_limit',
        retryAfterMs: err.retryAfterMs,
      };
    }

    if (err instanceof TimeoutError) {
      return {
        message: 'Service unavailable. Please check your connection and try again.',
        type: 'timeout',
      };
    }

    if (err instanceof AuthenticationError) {
      return {
        message: `Authentication failed: ${err.message}`,
        type: 'auth',
      };
    }

    return {
      message: err instanceof Error ? err.message : 'An unexpected error occurred.',
      type: 'unknown',
    };
  }, []);

  // ─── Session Restoration on Mount ───────────────────────────────────────

  useEffect(() => {
    if (restorationAttempted.current) return;
    restorationAttempted.current = true;

    const restoreSession = async () => {
      const storedSession = loadPersistedSession();
      if (!storedSession) {
        setIsLoading(false);
        return;
      }

      try {
        const info = await embeddedWallet.restoreWallet(storedSession);
        setSession(storedSession);
        setWalletInfo(info);
      } catch (err) {
        // Session is invalid or expired — clear it
        clearPersistedSession();
        setError(mapError(err));
      } finally {
        setIsLoading(false);
      }
    };

    restoreSession();
  }, [embeddedWallet, loadPersistedSession, clearPersistedSession, mapError]);

  // ─── Login ──────────────────────────────────────────────────────────────

  const login = useCallback(
    async (provider: AuthProvider) => {
      setIsLoading(true);
      setError(null);

      try {
        const walletSession = await embeddedWallet.authenticate(provider, {
          provider,
          token: '', // Token is populated by the SDK's OAuth flow
        });

        const info = await embeddedWallet.getWalletInfo(walletSession);

        setSession(walletSession);
        setWalletInfo(info);
        persistSession(walletSession);
      } catch (err) {
        setError(mapError(err));
      } finally {
        setIsLoading(false);
      }
    },
    [embeddedWallet, persistSession, mapError],
  );

  // ─── Logout ─────────────────────────────────────────────────────────────

  const logout = useCallback(() => {
    setSession(null);
    setWalletInfo(null);
    setError(null);
    clearPersistedSession();
  }, [clearPersistedSession]);

  // ─── Context Value ──────────────────────────────────────────────────────

  const value = useMemo<WalletContextValue>(
    () => ({
      session,
      walletInfo,
      isLoading,
      error,
      login,
      logout,
    }),
    [session, walletInfo, isLoading, error, login, logout],
  );

  return (
    <WalletContext.Provider value={value}>{children}</WalletContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Hook to access wallet session state and authentication actions.
 * Must be used within a WalletProvider component.
 */
export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
