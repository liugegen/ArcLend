"use client";

interface SkeletonLoaderProps {
  /** Width of the skeleton element (CSS value or number in px) */
  width?: string | number;
  /** Height of the skeleton element (CSS value or number in px) */
  height?: string | number;
  /** Additional CSS classes */
  className?: string;
}

/**
 * SkeletonLoader — animated shimmer placeholder displayed while data is loading.
 * Uses a 2s linear gradient sweep from left to right.
 *
 * Validates: Requirements 8.1, 8.2
 */
export function SkeletonLoader({ width, height, className = "" }: SkeletonLoaderProps) {
  const style: React.CSSProperties = {
    width: typeof width === "number" ? `${width}px` : width,
    height: typeof height === "number" ? `${height}px` : height,
  };

  return (
    <div
      role="status"
      aria-label="Loading"
      className={`rounded-md bg-[var(--card)] relative overflow-hidden ${className}`}
      style={style}
    >
      <div
        className="absolute inset-0 animate-[shimmer_2s_linear_infinite]"
        style={{
          backgroundImage:
            "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.06) 50%, transparent 100%)",
          backgroundSize: "200% 100%",
        }}
      />
      <span className="sr-only">Loading...</span>
    </div>
  );
}
