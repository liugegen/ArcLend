"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { crossfade } from "./variants";

interface PageTransitionProps {
  children: ReactNode;
}

/**
 * PageTransition wraps children with AnimatePresence for route crossfade.
 * Uses usePathname() from next/navigation as the key to trigger
 * exit/enter animations on navigation.
 *
 * Validates: Requirements 9.4, 9.5, 10.5
 */
export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={pathname}
        variants={crossfade}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
