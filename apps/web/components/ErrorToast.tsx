'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ErrorSeverity, MappedError } from '../lib/errorMapper';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ToastItem extends MappedError {
  id: string;
}

interface ErrorToastProps {
  toast: ToastItem;
  onDismiss: (id: string) => void;
  onAction?: (action: string) => void;
}

// ─── Auto-dismiss duration ──────────────────────────────────────────────────

const AUTO_DISMISS_MS = 5_000;

// ─── Severity Styles ────────────────────────────────────────────────────────

const severityStyles: Record<ErrorSeverity, string> = {
  error: 'border-[var(--danger)]/30 bg-[var(--danger-muted)] text-[var(--danger)]',
  warning: 'border-[var(--warning)]/30 bg-[var(--warning-muted)] text-[var(--warning)]',
  info: 'border-[var(--accent)]/30 bg-[var(--accent-muted)] text-[var(--accent)]',
};

const severityIconStyles: Record<ErrorSeverity, string> = {
  error: 'text-[var(--danger)]',
  warning: 'text-[var(--warning)]',
  info: 'text-[var(--accent)]',
};

const severityButtonStyles: Record<ErrorSeverity, string> = {
  error: 'bg-[var(--danger)] hover:opacity-80 text-white',
  warning: 'bg-[var(--warning)] hover:opacity-80 text-black',
  info: 'bg-[var(--accent)] hover:opacity-80 text-white',
};

// ─── Icons ──────────────────────────────────────────────────────────────────

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M10 6v4m0 4h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M4 4l8 8m0-8l-8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ─── ErrorToast Component ───────────────────────────────────────────────────

/**
 * Individual toast notification for displaying mapped errors.
 * Auto-dismisses after 5 seconds with animated slide-in/out.
 * Accessible via role="alert" and aria-live="assertive".
 */
export function ErrorToast({ toast, onDismiss, onAction }: ErrorToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  // Animate in on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  // Auto-dismiss after 5 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      handleDismiss();
    }, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss(toast.id);
    }, 300); // Match exit animation duration
  }, [onDismiss, toast.id]);

  const handleAction = useCallback(() => {
    if (toast.action && onAction) {
      onAction(toast.action);
    }
    handleDismiss();
  }, [toast.action, onAction, handleDismiss]);

  const translateClass = isExiting
    ? 'translate-x-full opacity-0'
    : isVisible
      ? 'translate-x-0 opacity-100'
      : 'translate-x-full opacity-0';

  return (
    <div
      role="alert"
      aria-live="assertive"
      aria-atomic="true"
      className={`
        pointer-events-auto w-full max-w-sm overflow-hidden rounded-lg border-l-4 shadow-lg
        transition-all duration-300 ease-in-out
        ${severityStyles[toast.severity]}
        ${translateClass}
      `}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className={`shrink-0 ${severityIconStyles[toast.severity]}`}>
            <ErrorIcon />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">{toast.title}</p>
            <p className="mt-1 text-sm opacity-90">{toast.message}</p>

            {/* Action button */}
            {toast.action && (
              <button
                type="button"
                onClick={handleAction}
                className={`
                  mt-2 inline-flex items-center rounded px-3 py-1.5 text-xs font-medium
                  transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1
                  ${severityButtonStyles[toast.severity]}
                `}
              >
                {toast.action}
              </button>
            )}
          </div>

          {/* Close button */}
          <button
            type="button"
            onClick={handleDismiss}
            className="shrink-0 rounded p-1 opacity-70 hover:opacity-100 transition-opacity focus:outline-none focus:ring-2"
            aria-label="Dismiss notification"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Toast Container ────────────────────────────────────────────────────────

interface ToastContainerProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onAction?: (action: string) => void;
}

/**
 * Container for stacking multiple toast notifications.
 * Positioned fixed at the top-right of the viewport.
 */
export function ToastContainer({ toasts, onDismiss, onAction }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed inset-0 z-50 flex flex-col items-end gap-2 p-4 sm:p-6"
    >
      {toasts.map((toast) => (
        <ErrorToast
          key={toast.id}
          toast={toast}
          onDismiss={onDismiss}
          onAction={onAction}
        />
      ))}
    </div>
  );
}

// ─── useToast Hook ──────────────────────────────────────────────────────────

let toastIdCounter = 0;

/**
 * Hook for managing toast notifications.
 * Provides methods to show errors and dismiss toasts.
 */
export function useToast() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showError = useCallback((mappedError: MappedError) => {
    const id = `toast-${++toastIdCounter}-${Date.now()}`;
    const newToast: ToastItem = { ...mappedError, id };
    setToasts((prev) => [...prev, newToast]);
    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const dismissAll = useCallback(() => {
    setToasts([]);
  }, []);

  return {
    toasts,
    showError,
    dismiss,
    dismissAll,
  };
}
