"use client";

import { type RefObject } from "react";

interface TopBarProps {
  /** Callback triggered when the mobile menu button is activated */
  onMenuOpen: () => void;
  /** Optional title displayed alongside branding */
  title?: string;
  /** Ref forwarded to the menu trigger button for focus management */
  menuTriggerRef?: RefObject<HTMLButtonElement | null>;
}

/**
 * TopBar — mobile header with hamburger menu button and branding.
 * Visible on viewports < 1024px; provides the primary trigger for the sidebar overlay.
 * All interactive elements maintain 44px minimum touch targets.
 *
 * Validates: Requirements 1.3, 11.4
 */
export function TopBar({ onMenuOpen, title, menuTriggerRef }: TopBarProps) {
  return (
    <header
      className="sticky top-0 z-40 flex items-center h-[var(--topbar-height)] px-4 lg:hidden border-b border-[var(--sidebar-border)] bg-[var(--sidebar)]"
      role="banner"
    >
      {/* Hamburger menu button — 44px touch target */}
      <button
        ref={menuTriggerRef}
        type="button"
        onClick={onMenuOpen}
        aria-label="Open navigation menu"
        className="flex items-center justify-center w-11 h-11 rounded-lg transition-colors hover:bg-[var(--sidebar-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden="true"
          className="text-[var(--foreground)]"
        >
          <path
            d="M3 5h14M3 10h14M3 15h14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {/* Branding */}
      <div className="ml-3 flex items-center gap-2">
        <span className="text-base font-semibold gradient-accent">
          ArcLend
        </span>
        {title && (
          <span className="text-sm text-[var(--muted-foreground)] hidden sm:inline">
            — {title}
          </span>
        )}
      </div>
    </header>
  );
}
