'use client';

/**
 * WalletContext — Circle User Controlled Wallets (Web SDK)
 *
 * MIGRATION NOTE:
 * The previous implementation used a custom EmbeddedWalletModule that made
 * direct REST calls to `POST /wallets/authenticate` — an endpoint that does
 * not exist in Circle's API, causing the 404 error.
 *
 * The correct flow uses the official @circle-fin/w3s-pw-web-sdk:
 * 1. SDK generates a deviceId (browser fingerprint)
 * 2. Backend exchanges deviceId for deviceToken + deviceEncryptionKey
 * 3. SDK performs social login (Google/Apple) via OAuth redirect
 * 4. SDK returns userToken + encryptionKey on successful login
 * 5. Backend initializes the user (creates wallet if needed)
 * 6. SDK executes the challenge to finalize wallet creation
 * 7. Backend fetches wallet details and balances
 *
 * The CIRCLE_API_KEY never leaves the server. Only the App ID and
 * Google Client ID are exposed to the browser.
 */

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
import { setCookie, getCookie } from 'cookies-next';

// ─── Types ──────────────────────────────────────────────────────────────────

export type AuthProvider = 'google' | 'apple' | 'email';

interface CircleWallet {
  id: string;
  address: string;
  blockchain: string;
}

interface WalletSession {
  userToken: string;
  encryptionKey: string;
  walletAddress: string;
  walletId: string;
}

interface WalletError {
  message: string;
  type: 'auth' | 'timeout' | 'sdk' | 'network' | 'rate_limit' | 'unknown';
  retryAfterMs?: number;
}

interface WalletContextValue {
  session: WalletSession | null;
  walletInfo: {
    address: `0x${string}`;
    balances: Record<string, bigint>;
    chainId: number;
  } | null;
  isLoading: boolean;
  error: WalletError | null;
  login: (provider: AuthProvider) => Promise<void>;
  logout: () => void;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const CIRCLE_APP_ID = process.env.NEXT_PUBLIC_CIRCLE_APP_ID ?? '';
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? '';
const SESSION_KEY = 'arclend_circle_session';

// ─── Context ────────────────────────────────────────────────────────────────

const WalletContext = createContext<WalletContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  const [session, setSession] = useState<WalletSession | null>(null);
  const [walletInfo, setWalletInfo] = useState<WalletContextValue['walletInfo']>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<WalletError | null>(null);

  const sdkRef = useRef<any>(null);
  const sdkReadyRef = useRef(false);
  const initAttemptedRef = useRef(false);

  // ─── Helper: Call backend API ───────────────────────────────────────────

  const callCircleApi = useCallback(
    async (action: string, params: Record<string, unknown> = {}) => {
      const response = await fetch('/api/circle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.message || data.error || `Circle API error (${response.status})`,
        );
      }

      return data;
    },
    [],
  );

  // ─── Helper: Load wallet details ───────────────────────────────────────

  const loadWalletDetails = useCallback(
    async (userToken: string, encryptionKey: string) => {
      const walletsData = await callCircleApi('listWallets', { userToken });
      const wallets: CircleWallet[] = walletsData.wallets ?? [];

      if (wallets.length === 0) {
        return null;
      }

      const primaryWallet = wallets[0]!;

      // Load balances
      let balances: Record<string, bigint> = {};
      try {
        const balanceData = await callCircleApi('getTokenBalance', {
          userToken,
          walletId: primaryWallet.id,
        });

        const tokenBalances = (balanceData.tokenBalances ?? []) as Array<{
          token?: { symbol?: string; tokenAddress?: string };
          amount?: string;
        }>;

        for (const entry of tokenBalances) {
          const address = entry.token?.tokenAddress ?? entry.token?.symbol ?? 'unknown';
          // Circle returns amounts as decimal strings; convert to 6-decimal bigint
          const amountStr = entry.amount ?? '0';
          const parts = amountStr.split('.');
          const whole = parts[0] ?? '0';
          const frac = (parts[1] ?? '').padEnd(6, '0').slice(0, 6);
          balances[address] = BigInt(whole) * 1_000_000n + BigInt(frac);
        }
      } catch (e) {
        console.warn('[WalletContext] Failed to load balances:', e);
      }

      const walletSession: WalletSession = {
        userToken,
        encryptionKey,
        walletAddress: primaryWallet.address,
        walletId: primaryWallet.id,
      };

      setSession(walletSession);
      setWalletInfo({
        address: primaryWallet.address as `0x${string}`,
        balances,
        chainId: 5042002,
      });

      // Persist session
      try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(walletSession));
      } catch { /* ignore */ }

      return walletSession;
    },
    [callCircleApi],
  );

  // ─── Initialize SDK + handle OAuth redirect ─────────────────────────────

  useEffect(() => {
    if (initAttemptedRef.current) return;
    initAttemptedRef.current = true;

    const initializeSDK = async () => {
      try {
        // Check for persisted session first
        const stored = localStorage.getItem(SESSION_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as WalletSession;
          // Try to load wallet details with stored token
          try {
            await loadWalletDetails(parsed.userToken, parsed.encryptionKey);
            setIsLoading(false);
            return;
          } catch {
            // Token expired or invalid — clear and continue to SDK init
            localStorage.removeItem(SESSION_KEY);
          }
        }

        // Dynamic import — the SDK is browser-only
        const { W3SSdk } = await import('@circle-fin/w3s-pw-web-sdk');

        // Restore cookies from pre-redirect state
        const restoredDeviceToken = (getCookie('arclend_deviceToken') as string) || '';
        const restoredDeviceEncryptionKey =
          (getCookie('arclend_deviceEncryptionKey') as string) || '';

        const onLoginComplete = (err: unknown, result: any) => {
          if (err) {
            const error = err as { message?: string };
            console.error('[WalletContext] Social login failed:', error);
            setError({
              message: error.message || 'Social login failed',
              type: 'auth',
            });
            setIsLoading(false);
            return;
          }

          // Login successful — initialize user and create/load wallet
          const userToken = result?.userToken as string;
          const encryptionKey = result?.encryptionKey as string;

          if (!userToken || !encryptionKey) {
            setError({
              message: 'Login succeeded but no credentials received',
              type: 'auth',
            });
            setIsLoading(false);
            return;
          }

          setIsLoading(true);
          void handlePostLogin(userToken, encryptionKey);
        };

        const sdk = new W3SSdk(
          {
            appSettings: { appId: CIRCLE_APP_ID },
            loginConfigs: {
              deviceToken: restoredDeviceToken,
              deviceEncryptionKey: restoredDeviceEncryptionKey,
              google: {
                clientId: GOOGLE_CLIENT_ID,
                redirectUri: typeof window !== 'undefined' ? window.location.origin : '',
                selectAccountPrompt: true,
              },
            },
          },
          onLoginComplete,
        );

        sdkRef.current = sdk;
        sdkReadyRef.current = true;
      } catch (err) {
        console.error('[WalletContext] SDK initialization failed:', err);
        setError({
          message: 'Failed to initialize wallet SDK',
          type: 'sdk',
        });
      } finally {
        setIsLoading(false);
      }
    };

    void initializeSDK();
  }, [loadWalletDetails]);

  // ─── Post-login: Initialize user + create wallet if needed ──────────────

  const handlePostLogin = useCallback(
    async (userToken: string, encryptionKey: string) => {
      try {
        // Try to initialize user (creates wallet challenge)
        const initData = await callCircleApi('initializeUser', { userToken });

        if (initData.challengeId) {
          // New user — execute challenge to create wallet
          const sdk = sdkRef.current;
          if (!sdk) {
            throw new Error('SDK not available for challenge execution');
          }

          sdk.setAuthentication({ userToken, encryptionKey });

          await new Promise<void>((resolve, reject) => {
            sdk.execute(initData.challengeId, (err: unknown) => {
              if (err) {
                const error = err as { message?: string };
                reject(new Error(error.message || 'Challenge execution failed'));
              } else {
                resolve();
              }
            });
          });

          // Wait briefly for Circle to index the new wallet
          await new Promise((r) => setTimeout(r, 2000));
        }

        // Load wallet details (works for both new and existing users)
        await loadWalletDetails(userToken, encryptionKey);
      } catch (err) {
        // Check if error is "user already initialized" (code 155106)
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (errorMsg.includes('155106') || errorMsg.includes('already')) {
          // User already has a wallet — just load it
          try {
            await loadWalletDetails(userToken, encryptionKey);
            return;
          } catch (loadErr) {
            console.error('[WalletContext] Failed to load existing wallet:', loadErr);
          }
        }

        console.error('[WalletContext] Post-login flow failed:', err);
        setError({
          message: errorMsg,
          type: 'unknown',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [callCircleApi, loadWalletDetails],
  );

  // ─── Login ──────────────────────────────────────────────────────────────

  const login = useCallback(
    async (provider: AuthProvider) => {
      setError(null);
      setIsLoading(true);

      try {
        const sdk = sdkRef.current;
        if (!sdk || !sdkReadyRef.current) {
          throw new Error('Wallet SDK is not ready. Please refresh the page.');
        }

        // Step 1: Get deviceId from SDK
        let deviceId: string;
        try {
          const cached = localStorage.getItem('arclend_deviceId');
          if (cached) {
            deviceId = cached;
          } else {
            deviceId = await sdk.getDeviceId();
            localStorage.setItem('arclend_deviceId', deviceId);
          }
        } catch {
          throw new Error('Failed to get device identifier');
        }

        // Step 2: Exchange deviceId for deviceToken via backend
        const tokenData = await callCircleApi('createDeviceToken', { deviceId });
        const { deviceToken, deviceEncryptionKey } = tokenData;

        if (!deviceToken || !deviceEncryptionKey) {
          throw new Error('Failed to create device token');
        }

        // Step 3: Persist tokens in cookies (survives OAuth redirect)
        setCookie('arclend_deviceToken', deviceToken);
        setCookie('arclend_deviceEncryptionKey', deviceEncryptionKey);

        // Step 4: Update SDK config with fresh tokens
        sdk.updateConfigs({
          appSettings: { appId: CIRCLE_APP_ID },
          loginConfigs: {
            deviceToken,
            deviceEncryptionKey,
            google: {
              clientId: GOOGLE_CLIENT_ID,
              redirectUri: window.location.origin,
              selectAccountPrompt: true,
            },
          },
        });

        // Step 5: Trigger social login (redirects to Google/Apple)
        // The SDK handles the OAuth flow and calls onLoginComplete after redirect
        const { SocialLoginProvider } = await import(
          '@circle-fin/w3s-pw-web-sdk/dist/src/types'
        );

        const providerMap: Record<string, any> = {
          google: SocialLoginProvider.GOOGLE,
          apple: SocialLoginProvider.APPLE,
        };

        if (provider === 'email') {
          // Email OTP flow is not yet implemented — requires verifyOtp SDK method
          throw new Error('Email login is not yet supported. Please use Google or Apple.');
        }

        const sdkProvider = providerMap[provider];
        if (!sdkProvider) {
          throw new Error(`Unsupported provider: ${provider}`);
        }

        sdk.performLogin(sdkProvider);
        // Note: This triggers a redirect. The page will reload and
        // onLoginComplete will fire with the result.
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Login failed';
        console.error('[WalletContext] Login error:', err);
        setError({ message, type: 'auth' });
        setIsLoading(false);
      }
    },
    [callCircleApi],
  );

  // ─── Logout ─────────────────────────────────────────────────────────────

  const logout = useCallback(() => {
    setSession(null);
    setWalletInfo(null);
    setError(null);
    try {
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem('arclend_deviceId');
    } catch { /* ignore */ }
  }, []);

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
