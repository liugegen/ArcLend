"use client";

import Link from "next/link";
import type { NavItem } from "../types";
import { SidebarTooltip } from "./SidebarTooltip";

interface SidebarNavItemProps {
  /** Navigation item data (icon, label, href) */
  item: NavItem;
  /** Whether this item matches the current route */
  isActive: boolean;
  /** Whether the sidebar is in collapsed mode */
  isCollapsed: boolean;
}

/**
 * SidebarNavItem — a single navigation item with icon-label pair.
 * Active state: left-edge indicator bar, tinted background, accent-colored icon.
 * Collapsed state: icon only, with tooltip on hover via SidebarTooltip.
 *
 * Validates: Requirements 2.1, 2.2, 2.7
 */
export function SidebarNavItem({ item, isActive, isCollapsed }: SidebarNavItemProps) {
  const Icon = item.icon;

  const content = (
    <Link
      href={item.href}
      aria-current={isActive ? "page" : undefined}
      aria-label={isCollapsed ? item.label : undefined}
      className="relative flex items-center gap-3 rounded-md transition-colors min-h-[44px]"
      style={{
        padding: isCollapsed ? "10px" : "10px 12px",
        justifyContent: isCollapsed ? "center" : "flex-start",
        background: isActive ? "var(--sidebar-active)" : "transparent",
        color: isActive ? "var(--accent)" : "var(--muted-foreground)",
      }}
    >
      {/* Left-edge indicator bar for active state */}
      {isActive && (
        <span
          aria-hidden="true"
          className="absolute left-0 top-1/2 -translate-y-1/2 rounded-r-full"
          style={{
            width: "3px",
            height: "60%",
            background: "var(--accent)",
          }}
        />
      )}

      {/* Icon — 18px */}
      <Icon
        className="shrink-0 w-[18px] h-[18px]"
      />

      {/* Label — 13px medium weight, hidden when collapsed */}
      {!isCollapsed && (
        <span
          className="truncate"
          style={{
            fontSize: "13px",
            fontWeight: 500,
            color: isActive ? "var(--foreground)" : "var(--muted-foreground)",
          }}
        >
          {item.label}
        </span>
      )}
    </Link>
  );

  // Wrap with tooltip when collapsed
  if (isCollapsed) {
    return (
      <SidebarTooltip label={item.label}>
        {content}
      </SidebarTooltip>
    );
  }

  return content;
}
