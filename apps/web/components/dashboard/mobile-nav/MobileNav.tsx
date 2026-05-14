"use client";

import type { NavItem } from "../types";

interface MobileNavProps {
  /** Array of navigation items to display (first 5 are rendered) */
  navItems: NavItem[];
  /** Current route path used to determine the active tab */
  currentPath: string;
}

/**
 * MobileNav — fixed bottom tab bar for mobile viewports (<1024px).
 * Displays 5 primary navigation icons with labels, highlights the active route,
 * and applies safe-area inset padding for notched devices.
 *
 * Validates: Requirements 11.5, 11.6
 */
export function MobileNav({ navItems, currentPath }: MobileNavProps) {
  // Only render the first 5 items as per requirement
  const items = navItems.slice(0, 5);

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 lg:hidden border-t border-[var(--sidebar-border)] bg-[var(--sidebar)]"
      style={{
        minHeight: "var(--mobile-nav-height)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
      role="navigation"
      aria-label="Mobile navigation"
    >
      <ul className="flex items-center justify-around h-[var(--mobile-nav-height)] px-1 m-0 list-none">
        {items.map((item) => {
          const isActive =
            currentPath === item.href ||
            (item.href !== "/dashboard" &&
              currentPath.startsWith(item.href));
          const Icon = item.icon;

          return (
            <li key={item.href} className="flex-1">
              <a
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`
                  flex flex-col items-center justify-center gap-0.5
                  min-w-[44px] min-h-[44px] rounded-lg
                  transition-colors duration-150
                  ${
                    isActive
                      ? "text-[var(--accent)]"
                      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                  }
                `}
              >
                <Icon
                  className={`w-5 h-5 ${
                    isActive ? "text-[var(--accent)]" : ""
                  }`}
                />
                <span
                  className={`text-[10px] leading-tight font-medium ${
                    isActive ? "text-[var(--accent)]" : ""
                  }`}
                >
                  {item.label}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
