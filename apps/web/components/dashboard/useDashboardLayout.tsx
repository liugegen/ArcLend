'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';

const STORAGE_KEY = 'arclend-sidebar-collapsed';
const MOBILE_QUERY = '(max-width: 1023px)';

interface DashboardLayoutState {
  sidebarCollapsed: boolean;
  mobileMenuOpen: boolean;
  isMobile: boolean;
  toggleSidebar: () => void;
  setMobileMenuOpen: (open: boolean) => void;
}

const DashboardLayoutContext = createContext<DashboardLayoutState | null>(null);

function getStoredCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'true';
  } catch {
    return false;
  }
}

export function DashboardLayoutProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() =>
    getStoredCollapsed()
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Persist sidebar collapsed state to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(sidebarCollapsed));
    } catch {
      // localStorage unavailable — ignore
    }
  }, [sidebarCollapsed]);

  // Derive isMobile from matchMedia listener
  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    setIsMobile(mql.matches);

    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Reset mobileMenuOpen on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  const value = useMemo<DashboardLayoutState>(
    () => ({
      sidebarCollapsed,
      mobileMenuOpen,
      isMobile,
      toggleSidebar,
      setMobileMenuOpen,
    }),
    [sidebarCollapsed, mobileMenuOpen, isMobile, toggleSidebar]
  );

  return (
    <DashboardLayoutContext.Provider value={value}>
      {children}
    </DashboardLayoutContext.Provider>
  );
}

export function useDashboardLayout(): DashboardLayoutState {
  const context = useContext(DashboardLayoutContext);
  if (!context) {
    throw new Error(
      'useDashboardLayout must be used within a DashboardLayoutProvider'
    );
  }
  return context;
}
