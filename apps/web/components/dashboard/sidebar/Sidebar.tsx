"use client";

import { usePathname } from "next/navigation";
import type { NavItem } from "../types";
import { SidebarNavItem } from "./SidebarNavItem";

interface WalletInfo {
  address?: string;
  balance?: string;
  isConnected: boolean;
}

interface SidebarProps {
  /** Whether the sidebar is in collapsed state (72px) or expanded (260px) */
  collapsed: boolean;
  /** Callback to toggle collapsed state */
  onToggle: () => void;
  /** Navigation items to render */
  navItems: NavItem[];
  /** Wallet connection info displayed at the bottom */
  walletInfo: WalletInfo;
}

/**
 * Sidebar — main navigation panel with collapse animation.
 * Animates between 260px (expanded) and 72px (collapsed) over 300ms ease-in-out.
 * In collapsed state: icons centered horizontally, no labels visible.
 *
 * Validates: Requirements 2.3, 2.6, 2.7
 */
export function Sidebar({ collapsed, onToggle, navItems, walletInfo }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Sidebar navigation"
      className="flex flex-col h-full overflow-hidden"
      style={{
        width: collapsed ? "72px" : "260px",
        transition: "width 300ms ease-in-out",
        background: "var(--card-bg, rgba(12, 16, 25, 0.95))",
        borderRight: "1px solid var(--card-border, rgba(255, 255, 255, 0.06))",
      }}
    >
      {/* Navigation items section */}
      <nav
        className="flex flex-col flex-1"
        style={{ padding: "20px" }}
      >
        <div className="flex flex-col" style={{ gap: "6px" }}>
          {navItems.map((item) => (
            <SidebarNavItem
              key={item.href}
              item={item}
              isActive={pathname === item.href}
              isCollapsed={collapsed}
            />
          ))}
        </div>
      </nav>

      {/* Wallet info section */}
      <div
        style={{
          padding: "20px",
          borderTop: "1px solid var(--card-border, rgba(255, 255, 255, 0.06))",
        }}
      >
        {walletInfo.isConnected ? (
          <div
            className="flex items-center"
            style={{
              gap: collapsed ? "0" : "10px",
              justifyContent: collapsed ? "center" : "flex-start",
            }}
          >
            {/* Connected indicator dot */}
            <span
              aria-hidden="true"
              className="shrink-0 rounded-full"
              style={{
                width: "8px",
                height: "8px",
                background: "#22c55e",
              }}
            />
            {!collapsed && (
              <div className="flex flex-col overflow-hidden">
                <span
                  className="truncate"
                  style={{
                    fontSize: "12px",
                    fontWeight: 500,
                    color: "var(--foreground)",
                  }}
                >
                  {walletInfo.address
                    ? `${walletInfo.address.slice(0, 6)}...${walletInfo.address.slice(-4)}`
                    : "Connected"}
                </span>
                {walletInfo.balance && (
                  <span
                    style={{
                      fontSize: "11px",
                      color: "var(--muted-foreground)",
                    }}
                  >
                    {walletInfo.balance} USDC
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <div
            className="flex items-center"
            style={{
              justifyContent: collapsed ? "center" : "flex-start",
              gap: collapsed ? "0" : "10px",
            }}
          >
            {/* Disconnected indicator dot */}
            <span
              aria-hidden="true"
              className="shrink-0 rounded-full"
              style={{
                width: "8px",
                height: "8px",
                background: "var(--muted-foreground, #6b7280)",
                opacity: 0.5,
              }}
            />
            {!collapsed && (
              <span
                style={{
                  fontSize: "12px",
                  color: "var(--muted-foreground)",
                }}
              >
                Not connected
              </span>
            )}
          </div>
        )}
      </div>

      {/* Collapse toggle button */}
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="flex items-center justify-center shrink-0"
        style={{
          height: "44px",
          borderTop: "1px solid var(--card-border, rgba(255, 255, 255, 0.06))",
          background: "transparent",
          color: "var(--muted-foreground)",
          cursor: "pointer",
          transition: "color 200ms ease",
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transform: collapsed ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 300ms ease-in-out",
          }}
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      </button>
    </aside>
  );
}
