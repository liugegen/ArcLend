'use client';

/**
 * Bridge Page — Coming Soon
 *
 * The CCTP bridge feature (Arbitrum → Arc Network) is under active development.
 * The underlying architecture (packages/circle-sdk/src/cctp.ts) is preserved
 * and will be re-enabled once the full cross-chain UX is production-ready.
 *
 * This placeholder ensures clean routing if a user navigates here directly.
 */

export default function BridgePage() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent-muted)]">
          <svg
            className="h-8 w-8 text-[var(--accent)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">
          Cross-Chain Bridge
        </h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Coming Soon
        </p>
        <p className="mt-3 max-w-sm text-xs text-[var(--muted-foreground)]/70">
          CCTP-powered USDC bridging from Arbitrum and other supported chains
          to Arc Network is currently in development.
        </p>
      </div>
    </div>
  );
}
