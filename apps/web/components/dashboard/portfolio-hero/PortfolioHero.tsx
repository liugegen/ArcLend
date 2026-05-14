"use client";

import { motion } from "framer-motion";
import { MetricCard } from "./MetricCard";
import type { PortfolioMetric } from "../types";
import { staggerContainer, staggerChild } from "../motion";

interface PortfolioHeroProps {
  metrics: PortfolioMetric[];
  isLoading?: boolean;
}

/**
 * PortfolioHero — presentational component rendering portfolio metrics
 * in a responsive grid with animated gradient background and stagger animations.
 *
 * Responsive grid:
 * - 1 column  < 640px
 * - 2 columns 640–1023px
 * - 4 columns ≥ 1024px
 *
 * Validates: Requirements 3.1, 3.2, 9.2
 */
export function PortfolioHero({ metrics, isLoading = false }: PortfolioHeroProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl p-6 sm:p-8">
      {/* Animated gradient background */}
      <div
        className="absolute inset-0 -z-10"
        aria-hidden="true"
        style={{
          background:
            "linear-gradient(135deg, #080b12 0%, #1e1b4b 50%, #080b12 100%)",
          backgroundSize: "200% 200%",
          animation: "portfolioGradientCycle 10s linear infinite",
        }}
      />

      {/* Staggered metric cards grid */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        variants={staggerContainer}
        initial="initial"
        animate="animate"
      >
        {metrics.map((metric) => {
          const isZero =
            metric.value.startsWith("$0.00") || metric.value === "0.00";

          return (
            <motion.div key={metric.label} variants={staggerChild}>
              <MetricCard
                label={metric.label}
                value={metric.value}
                subValue={metric.subValue}
                isLoading={isLoading}
                isZero={isZero}
              />
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}
