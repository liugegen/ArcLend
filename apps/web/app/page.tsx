'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useWallet, type AuthProvider } from '../contexts/WalletContext';

// ─── Helpers ────────────────────────────────────────────────────────────────

function useCountdown(retryAfterMs: number | undefined): number {
  const [remaining, setRemaining] = useState(
    retryAfterMs ? Math.ceil(retryAfterMs / 1000) : 0,
  );

  useEffect(() => {
    if (!retryAfterMs || retryAfterMs <= 0) {
      setRemaining(0);
      return;
    }

    setRemaining(Math.ceil(retryAfterMs / 1000));

    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [retryAfterMs]);

  return remaining;
}

// ─── Page Component ─────────────────────────────────────────────────────────

export default function Home() {
  const { session, walletInfo, isLoading, error, login, logout } = useWallet();
  const router = useRouter();

  const countdown = useCountdown(error?.retryAfterMs);
  const isRateLimited = error?.type === 'rate_limit' && countdown > 0;

  // Redirect authenticated users to dashboard
  useEffect(() => {
    if (session && walletInfo) {
      router.push('/dashboard');
    }
  }, [session, walletInfo, router]);

  const handleLogin = (provider: AuthProvider) => {
    if (isRateLimited) return;
    login(provider);
  };

  // ─── Loading State ────────────────────────────────────────────────────────

  if (isLoading && !session) {
    return (
      <div style={styles.page}>
        <main style={styles.main}>
          <div style={styles.spinner} aria-label="Loading" role="status">
            <span style={styles.srOnly}>Loading...</span>
          </div>
        </main>
      </div>
    );
  }

  // ─── Authenticated State — redirect handled by useEffect above ─────────

  if (session && walletInfo) {
    return (
      <div style={styles.page}>
        <main style={styles.main}>
          <div style={styles.spinner} aria-label="Redirecting" role="status">
            <span style={styles.srOnly}>Redirecting to dashboard...</span>
          </div>
        </main>
      </div>
    );
  }

  // ─── Unauthenticated State ────────────────────────────────────────────────

  return (
    <div style={styles.page}>
      <main style={styles.main}>
        <h1 style={styles.heading}>ArcLend</h1>
        <p style={styles.subheading}>
          Lending &amp; borrowing on Arc Network. No seed phrases, no gas tokens.
        </p>

        {/* Error Display */}
        {error && (
          <div style={styles.errorContainer} role="alert">
            <p style={styles.errorMessage}>{error.message}</p>
            {isRateLimited && (
              <p style={styles.countdown}>
                Retry in {countdown}s
              </p>
            )}
          </div>
        )}

        {/* Social Login Buttons */}
        <div style={styles.buttonGroup}>
          <button
            type="button"
            onClick={() => handleLogin('google')}
            disabled={isLoading || isRateLimited}
            style={{
              ...styles.loginButton,
              ...(isLoading || isRateLimited ? styles.loginButtonDisabled : {}),
            }}
            aria-label="Continue with Google"
          >
            <GoogleIcon />
            <span>Continue with Google</span>
          </button>

          <button
            type="button"
            onClick={() => handleLogin('apple')}
            disabled={isLoading || isRateLimited}
            style={{
              ...styles.loginButton,
              ...(isLoading || isRateLimited ? styles.loginButtonDisabled : {}),
            }}
            aria-label="Continue with Apple"
          >
            <AppleIcon />
            <span>Continue with Apple</span>
          </button>

          <button
            type="button"
            onClick={() => handleLogin('email')}
            disabled={isLoading || isRateLimited}
            style={{
              ...styles.loginButton,
              ...(isLoading || isRateLimited ? styles.loginButtonDisabled : {}),
            }}
            aria-label="Continue with Email"
          >
            <EmailIcon />
            <span>Continue with Email</span>
          </button>
        </div>

        {/* Retry Button (shown on non-rate-limit errors) */}
        {error && !isRateLimited && (
          <button
            type="button"
            onClick={() => handleLogin('email')}
            disabled={isLoading}
            style={styles.retryButton}
            aria-label="Retry authentication"
          >
            Retry
          </button>
        )}
      </main>
    </div>
  );
}

// ─── Icons ──────────────────────────────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="M22 7l-10 6L2 7" />
    </svg>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  page: {
    display: 'flex',
    minHeight: '100vh',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    background: 'var(--background)',
    position: 'relative',
    overflow: 'hidden',
  },
  main: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2rem',
    maxWidth: '400px',
    width: '100%',
    position: 'relative',
    zIndex: 1,
  },
  heading: {
    fontSize: '2.75rem',
    fontWeight: 800,
    letterSpacing: '-0.03em',
    margin: 0,
    background: 'linear-gradient(135deg, var(--foreground) 0%, var(--muted-foreground) 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text',
  },
  subheading: {
    fontSize: '1rem',
    color: 'var(--muted-foreground)',
    textAlign: 'center',
    margin: 0,
    lineHeight: 1.6,
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
    width: '100%',
  },
  loginButton: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    width: '100%',
    padding: '1rem 1.5rem',
    fontSize: '0.9375rem',
    fontWeight: 500,
    border: '1px solid var(--card-border)',
    borderRadius: '1rem',
    background: 'var(--card)',
    color: 'var(--foreground)',
    cursor: 'pointer',
    transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
  },
  loginButtonDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed',
  },
  errorContainer: {
    width: '100%',
    padding: '1rem',
    borderRadius: '1rem',
    background: 'var(--danger-muted)',
    border: '1px solid rgba(248, 113, 113, 0.3)',
  },
  errorMessage: {
    fontSize: '0.875rem',
    color: 'var(--danger)',
    margin: 0,
    lineHeight: 1.5,
  },
  countdown: {
    fontSize: '0.8125rem',
    color: 'var(--danger)',
    marginTop: '0.5rem',
    fontWeight: 500,
  },
  retryButton: {
    padding: '0.75rem 1.5rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    border: '1px solid var(--card-border)',
    borderRadius: '0.75rem',
    background: 'var(--card)',
    color: 'var(--foreground)',
    cursor: 'pointer',
    transition: 'all 200ms',
  },
  card: {
    width: '100%',
    padding: '1.5rem',
    borderRadius: '1.25rem',
    border: '1px solid var(--card-border)',
    background: 'var(--card)',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  cardRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: '0.875rem',
    color: 'var(--muted-foreground)',
  },
  value: {
    fontSize: '0.9375rem',
    fontWeight: 600,
    fontFamily: 'var(--font-geist-mono)',
    color: 'var(--foreground)',
  },
  logoutButton: {
    padding: '0.625rem 1.5rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    border: '1px solid var(--card-border)',
    borderRadius: '0.75rem',
    background: 'var(--card)',
    color: 'var(--danger)',
    cursor: 'pointer',
  },
  spinner: {
    width: '2.5rem',
    height: '2.5rem',
    border: '3px solid var(--card-border)',
    borderTopColor: 'var(--accent)',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
};
