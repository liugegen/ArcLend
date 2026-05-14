"use client";

import type { Variants } from "framer-motion";

/**
 * Checks if the user prefers reduced motion.
 * Returns true when animations should be disabled.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Returns 0 if reduced motion is preferred, otherwise the given duration in seconds.
 */
function dur(ms: number): number {
  return prefersReducedMotion() ? 0 : ms / 1000;
}

/**
 * fadeIn — opacity 0→1 over 300ms ease-out.
 * Used for page mount animations.
 *
 * Validates: Requirements 9.1, 9.5
 */
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: () => ({
    opacity: 1,
    transition: { duration: dur(300), ease: "easeOut" },
  }),
  exit: () => ({
    opacity: 0,
    transition: { duration: dur(300), ease: "easeOut" },
  }),
};

/**
 * staggerContainer — orchestrates stagger of children by 50ms, max 20 items.
 * Items beyond the 20th animate simultaneously with the 20th.
 *
 * Validates: Requirements 9.2, 9.5
 */
export const staggerContainer: Variants = {
  initial: {},
  animate: () => ({
    transition: {
      staggerChildren: prefersReducedMotion() ? 0 : 0.05,
      delayChildren: 0,
    },
  }),
};

/**
 * staggerChild — translateY 8→0 over 300ms ease-out.
 * Used as children inside a staggerContainer.
 *
 * Validates: Requirements 9.2, 9.5
 */
export const staggerChild: Variants = {
  initial: () => ({
    opacity: 0,
    y: prefersReducedMotion() ? 0 : 8,
  }),
  animate: () => ({
    opacity: 1,
    y: 0,
    transition: { duration: dur(300), ease: "easeOut" },
  }),
};

/**
 * cardHover — scale(1.02) over 200ms ease-out on hover.
 *
 * Validates: Requirements 9.3, 9.5
 */
export const cardHover: Variants = {
  initial: { scale: 1 },
  hover: () => ({
    scale: prefersReducedMotion() ? 1 : 1.02,
    transition: { duration: dur(200), ease: "easeOut" },
  }),
};

/**
 * crossfade — opacity transition over 200ms for route changes.
 *
 * Validates: Requirements 9.4, 9.5
 */
export const crossfade: Variants = {
  initial: { opacity: 0 },
  animate: () => ({
    opacity: 1,
    transition: { duration: dur(200), ease: "easeOut" },
  }),
  exit: () => ({
    opacity: 0,
    transition: { duration: dur(200), ease: "easeOut" },
  }),
};
