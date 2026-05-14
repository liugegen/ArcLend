'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useWallet } from '../../contexts/WalletContext';
import { ToastContainer, useToast } from '../../components/ErrorToast';
import {
  DashboardLayoutProvider,
  useDashboardLayout,
} from '../../components/dashboard/useDashboardLayout';
import { Sidebar, MobileSidebarOverlay } from '../../components/dashboard/sidebar';
import { TopBar } from '../../components/dashboard/topbar';
import { MobileNav } from '../../components/dashboard/mobile-nav';
import { PageTransition } from '../../components/dashboard/motion';
import type { NavItem } from '../../components/dashboard/types';
import { USDC_ADDRESS } from '../../lib/contracts';
import {
  DashboardIcon,
  MarketsIcon,
  PortfolioIcon,
  SupplyIcon,
  BorrowIcon,
  SettingsIcon,
  RepayIcon,
  WithdrawIcon,
} from './nav-icons';

// ─── Navigation Items ───────────────────────────────────────────────────────

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: DashboardIcon },
  { label: 'Markets', href: '/dashboard/markets', icon: MarketsIcon },
  { label: 'Portfolio', href: '/dashboard/portfolio', icon: PortfolioIcon },
  { label: 'Supply', href: '/dashboard/supply', icon: SupplyIcon },
  { label: 'Borrow', href: '/dashboard/borrow', icon: BorrowIcon },
  { label: 'Repay', href: '/dashboard/repay', icon: RepayIcon },
  { label: 'Withdraw', href: '/dashboard/withdraw', icon: WithdrawIcon },
  { label: 'Settings', href: '/dashboard/settings', icon: SettingsIcon },
];

// ─── Layout Entry Point ─────────────────────────────────────────────────────

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { session, isLoading } = useWallet();
  const router = useRouter();

  // Redirect to login if not authenticated
  if (!isLoading && !session) {
    router.push('/');
    return null;
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-[#080b12] to-[#0c1019]">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--card-border)] border-t-[var(--accent)]" />
            <div className="absolute inset-0 h-10 w-10 animate-ping rounded-full border border-[var(--accent)] opacity-20" />
          </div>
          <p className="text-sm font-medium text-[var(--muted-foreground)]">Loading ArcLend...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayoutProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </DashboardLayoutProvider>
  );
}

// ─── Inner Layout (uses context) ────────────────────────────────────────────

function DashboardLayoutInner({ children }: { children: React.ReactNode }) {
  const {
    sidebarCollapsed,
    mobileMenuOpen,
    isMobile,
    toggleSidebar,
    setMobileMenuOpen,
  } = useDashboardLayout();
  const { walletInfo } = useWallet();
  const { toasts, dismiss } = useToast();
  const pathname = usePathname();

  // Focus management ref for mobile overlay return focus
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

  const usdcBalance = walletInfo?.balances[USDC_ADDRESS] ?? 0n;

  const walletData = {
    address: walletInfo?.address,
    balance: formatUSDC(usdcBalance),
    isConnected: !!walletInfo,
  };

  const sidebarWidth = sidebarCollapsed ? 72 : 260;

  // Close overlay handler
  const closeOverlay = useCallback(() => {
    setMobileMenuOpen(false);
  }, [setMobileMenuOpen]);

  // Return focus to menu trigger when overlay closes
  useEffect(() => {
    if (!mobileMenuOpen && menuTriggerRef.current) {
      menuTriggerRef.current.focus();
    }
  }, [mobileMenuOpen]);

  return (
    <div
      className="relative min-h-screen overflow-x-hidden bg-gradient-to-b from-[#080b12] to-[#0c1019]"
      style={{ minWidth: '320px' }}
    >
      {/* Desktop Sidebar — fixed left */}
      {!isMobile && (
        <div
          className="fixed left-0 top-0 z-30 h-screen"
          style={{ width: `${sidebarWidth}px` }}
        >
          <Sidebar
            collapsed={sidebarCollapsed}
            onToggle={toggleSidebar}
            navItems={NAV_ITEMS}
            walletInfo={walletData}
          />
        </div>
      )}

      {/* Mobile TopBar */}
      {isMobile && (
        <TopBar onMenuOpen={() => setMobileMenuOpen(true)} menuTriggerRef={menuTriggerRef} />
      )}

      {/* Main Content Area */}
      <main
        className="transition-[margin] duration-300 ease-in-out"
        style={{
          marginLeft: isMobile ? 0 : `${sidebarWidth}px`,
          paddingBottom: isMobile ? 'calc(56px + env(safe-area-inset-bottom, 0px))' : undefined,
        }}
      >
        <div
          className="mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 min-[1440px]:px-12"
          style={{ maxWidth: '1440px' }}
        >
          <PageTransition>
            {children}
          </PageTransition>
        </div>
      </main>

      {/* Mobile Navigation — fixed bottom */}
      {isMobile && (
        <MobileNav navItems={NAV_ITEMS} currentPath={pathname} />
      )}

      {/* Mobile Sidebar Overlay with focus trap */}
      {isMobile && mobileMenuOpen && (
        <MobileSidebarOverlay
          navItems={NAV_ITEMS}
          walletInfo={walletData}
          onClose={closeOverlay}
        />
      )}

      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onDismiss={dismiss} />
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatUSDC(balance: bigint): string {
  const whole = balance / 1_000_000n;
  const fractional = balance % 1_000_000n;
  const fractionalStr = fractional.toString().padStart(6, '0').slice(0, 2);
  return `${whole.toLocaleString()}.${fractionalStr}`;
}

