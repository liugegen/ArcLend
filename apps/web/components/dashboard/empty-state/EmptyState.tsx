"use client";

import Link from "next/link";
import type { ReactNode } from "react";

interface EmptyStateProps {
  /** Illustrative icon (minimum 48px rendered size) */
  icon: ReactNode;
  /** Descriptive message explaining the empty context */
  message: string;
  /** Label for the call-to-action button */
  actionLabel: string;
  /** Destination URL for the CTA button */
  actionHref: string;
}

/**
 * EmptyState — centered placeholder displayed when no data is available.
 * Renders an icon, message, and a primary CTA button linking to the relevant page.
 *
 * Validates: Requirements 8.3, 8.5
 */
export function EmptyState({ icon, message, actionLabel, actionHref }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center w-full">
      <div className="min-w-[48px] min-h-[48px] flex items-center justify-center text-[var(--muted-foreground)] mb-4">
        {icon}
      </div>
      <p className="text-sm text-[var(--muted-foreground)] leading-relaxed max-w-md mb-6">
        {message}
      </p>
      <Link
        href={actionHref}
        className="inline-flex items-center justify-center px-5 py-2.5 min-h-[44px] rounded-lg bg-gradient-to-r from-[var(--accent)] to-[#a78bfa] text-white text-sm font-medium transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
      >
        {actionLabel}
      </Link>
    </div>
  );
}
