"use client";

import { useState, useEffect, useRef, useCallback } from "react";

interface MarketSearchProps {
  /** Current external filter value */
  value: string;
  /** Callback fired after 200ms debounce from last keystroke */
  onChange: (query: string) => void;
}

/**
 * MarketSearch — search input with 200ms debounced filtering for the market table.
 * Performs case-insensitive substring matching against asset names.
 *
 * Validates: Requirements 5.6
 */
export function MarketSearch({ value, onChange }: MarketSearchProps) {
  const [internalValue, setInternalValue] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync internal state when external value changes (e.g. "clear filter" action)
  useEffect(() => {
    setInternalValue(value);
  }, [value]);

  const debouncedOnChange = useCallback(
    (query: string) => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        onChange(query);
      }, 200);
    },
    [onChange]
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    debouncedOnChange(newValue);
  };

  const handleClear = () => {
    setInternalValue("");
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    onChange("");
    inputRef.current?.focus();
  };

  return (
    <div className="relative w-full max-w-sm">
      {/* Search icon */}
      <svg
        className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M7.333 12.667A5.333 5.333 0 1 0 7.333 2a5.333 5.333 0 0 0 0 10.667ZM14 14l-2.9-2.9"
          stroke="var(--muted-foreground)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      <input
        ref={inputRef}
        type="text"
        value={internalValue}
        onChange={handleChange}
        placeholder="Search markets..."
        aria-label="Search markets"
        className="w-full h-10 pl-9 pr-9 text-sm rounded-lg transition-colors"
        style={{
          background: "var(--input-bg)",
          border: "1px solid var(--input-border)",
          color: "var(--foreground)",
          outline: "none",
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--input-focus)";
          e.currentTarget.style.boxShadow =
            "0 0 0 2px rgba(99, 102, 241, 0.1)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--input-border)";
          e.currentTarget.style.boxShadow = "none";
        }}
      />

      {/* Clear button */}
      {internalValue && (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center justify-center w-6 h-6 rounded-md transition-colors"
          style={{
            color: "var(--muted-foreground)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
            e.currentTarget.style.color = "var(--foreground)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--muted-foreground)";
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 14 14"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M10.5 3.5 3.5 10.5M3.5 3.5l7 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
