"use client";

interface SidebarWalletInfoProps {
  /** Wallet address (hex string) */
  address?: string;
  /** USDC balance as a string (raw or formatted) */
  balance?: string;
  /** Whether the wallet is currently connected */
  isConnected: boolean;
  /** Whether the sidebar is in collapsed mode */
  isCollapsed?: boolean;
}

/**
 * Truncates a wallet address to first 6 + "..." + last 4 characters.
 * e.g. "0x1234567890abcdef" → "0x1234...cdef"
 */
function truncateAddress(address: string): string {
  if (address.length <= 10) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Formats a balance string to 2 decimal places.
 */
function formatBalance(balance: string): string {
  const num = parseFloat(balance);
  if (isNaN(num)) return "0.00";
  return num.toFixed(2);
}

/**
 * SidebarWalletInfo — displays wallet connection status, truncated address,
 * and USDC balance in the sidebar footer.
 *
 * Connected state: green dot, truncated address, formatted USDC balance.
 * Disconnected state: red/gray dot, "Not connected" text with connection prompt.
 * Collapsed state: only the status indicator dot is shown.
 *
 * Validates: Requirements 2.4, 2.5
 */
export function SidebarWalletInfo({
  address,
  balance,
  isConnected,
  isCollapsed = false,
}: SidebarWalletInfoProps) {
  const statusDot = (
    <span
      aria-hidden="true"
      className="shrink-0 rounded-full"
      style={{
        width: "8px",
        height: "8px",
        background: isConnected ? "#22c55e" : "#6b7280",
        boxShadow: isConnected ? "0 0 6px rgba(34, 197, 94, 0.4)" : "none",
      }}
    />
  );

  // Collapsed: show only the status dot centered
  if (isCollapsed) {
    return (
      <div
        className="flex items-center justify-center"
        style={{ padding: "12px" }}
        aria-label={isConnected ? "Wallet connected" : "Wallet not connected"}
      >
        {statusDot}
      </div>
    );
  }

  // Disconnected state
  if (!isConnected) {
    return (
      <div
        className="flex items-center gap-3 rounded-md"
        style={{
          padding: "12px",
          background: "rgba(255, 255, 255, 0.03)",
          border: "1px solid rgba(255, 255, 255, 0.06)",
        }}
      >
        {statusDot}
        <div className="flex flex-col gap-0.5">
          <span
            style={{
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--muted-foreground)",
            }}
          >
            Not connected
          </span>
          <span
            style={{
              fontSize: "11px",
              color: "var(--muted-foreground)",
              opacity: 0.7,
            }}
          >
            Connect wallet to continue
          </span>
        </div>
      </div>
    );
  }

  // Connected state
  return (
    <div
      className="flex items-center gap-3 rounded-md"
      style={{
        padding: "12px",
        background: "rgba(255, 255, 255, 0.03)",
        border: "1px solid rgba(255, 255, 255, 0.06)",
      }}
    >
      {statusDot}
      <div className="flex flex-col gap-0.5 overflow-hidden">
        <span
          className="truncate"
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: "var(--foreground)",
          }}
          title={address}
        >
          {address ? truncateAddress(address) : ""}
        </span>
        <span
          style={{
            fontSize: "11px",
            color: "var(--muted-foreground)",
          }}
        >
          {balance ? `${formatBalance(balance)} USDC` : "0.00 USDC"}
        </span>
      </div>
    </div>
  );
}
