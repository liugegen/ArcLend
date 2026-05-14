"use client";

import { type ReactNode, useState, useRef, useCallback, useEffect, useId } from "react";

interface SidebarTooltipProps {
  /** Text label displayed in the tooltip */
  label: string;
  /** The element that triggers the tooltip on hover */
  children: ReactNode;
}

/**
 * SidebarTooltip — tooltip shown on hover when the sidebar is collapsed.
 * Appears after a 200ms delay, positioned to the right of the icon.
 *
 * Validates: Requirements 2.7
 */
export function SidebarTooltip({ label, children }: SidebarTooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const handleMouseEnter = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setVisible(true);
    }, 200);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setVisible(false);
  }, []);

  const handleFocus = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setVisible(true);
    }, 200);
  }, []);

  const handleBlur = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setVisible(false);
  }, []);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      {children}
      {visible && (
        <div
          id={tooltipId}
          role="tooltip"
          className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap z-50 pointer-events-none"
          style={{
            background: "var(--card-elevated)",
            color: "var(--foreground)",
            border: "1px solid var(--card-border)",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}
