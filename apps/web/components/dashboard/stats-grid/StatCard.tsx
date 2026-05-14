"use client";

interface StatCardProps {
  /** 11px uppercase tracking-wider label */
  label: string;
  /** 28px bold primary value */
  value: string;
  /** 12px secondary text at 60% opacity */
  secondaryText?: string;
}

/**
 * StatCard — individual metric card for the StatsGrid.
 * Applies glassmorphism styling, responsive padding, hover lift effect,
 * and a strict typography hierarchy.
 *
 * Validates: Requirements 4.3, 4.4, 4.5, 4.6
 */
export function StatCard({ label, value, secondaryText }: StatCardProps) {
  return (
    <div
      className={[
        // Glassmorphism card surface
        "rounded-xl",
        "bg-white/[0.08] backdrop-blur-[12px]",
        "border border-white/0",
        // Responsive internal padding: 20px < 640px, 24px ≥ 640px
        "p-5 sm:p-6",
        // Hover: translateY(-2px) + border opacity 0→0.1, 200ms transition
        "transition-all duration-200 ease-out",
        "hover:-translate-y-0.5 hover:border-white/10",
      ].join(" ")}
    >
      {/* Label: 11px uppercase tracking-wider */}
      <p
        className="text-[11px] uppercase tracking-wider text-white/70 mb-2"
      >
        {label}
      </p>

      {/* Value: 28px bold */}
      <p
        className="text-[28px] font-bold text-white leading-tight"
      >
        {value}
      </p>

      {/* Secondary text: 12px at 60% opacity */}
      {secondaryText && (
        <p
          className="text-[12px] text-white/60 mt-1"
        >
          {secondaryText}
        </p>
      )}
    </div>
  );
}
