"use client";

import { useCallback, useEffect, useRef } from "react";
import { Sidebar } from "./Sidebar";
import type { NavItem } from "../types";

interface WalletData {
  address: string | undefined;
  balance: string;
  isConnected: boolean;
}

interface MobileSidebarOverlayProps {
  navItems: NavItem[];
  walletInfo: WalletData;
  onClose: () => void;
}

/**
 * MobileSidebarOverlay — full-screen overlay containing the sidebar
 * with focus trap and keyboard dismiss support.
 *
 * Validates: Requirements 1.3, 7.6, 11.4
 */
export function MobileSidebarOverlay({
  navItems,
  walletInfo,
  onClose,
}: MobileSidebarOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Focus management: move focus into overlay on mount
  useEffect(() => {
    if (overlayRef.current) {
      const focusable = overlayRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      const firstEl = focusable[0];
      if (firstEl) {
        firstEl.focus();
      }
    }
  }, []);

  // Keyboard handler: Escape to close, Tab trap
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }

      if (e.key === "Tab" && overlayRef.current) {
        const focusable = overlayRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0] as HTMLElement;
        const last = focusable[focusable.length - 1] as HTMLElement;

        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    },
    [onClose]
  );

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Navigation menu"
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Sidebar panel */}
      <div className="relative z-10 h-full w-[260px]">
        <Sidebar
          collapsed={false}
          onToggle={onClose}
          navItems={navItems}
          walletInfo={walletInfo}
        />
        {/* Close button — 44px touch target */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-4 flex h-11 w-11 items-center justify-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--foreground)]"
          aria-label="Close navigation menu"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
