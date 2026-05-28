import { useMemo } from "react";
import { useSvgId } from "../../hooks/useSvgId";

export function MiniSparkline({ values, tone = "cyan" }: { values: number[]; tone?: "cyan" | "green" | "gold" | "red" }) {
  const gradientId = useSvgId("spark");
  const points = useMemo(() => {
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = Math.max(1, max - min);
    return values
      .map((value, index) => {
        const x = (index / Math.max(1, values.length - 1)) * 100;
        const y = 36 - ((value - min) / range) * 30;
        return `${x},${y}`;
      })
      .join(" ");
  }, [values]);

  return (
    <svg className="mini-sparkline" viewBox="0 0 100 40" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1">
          <stop offset="0%" stopColor={`var(--${tone})`} stopOpacity="0.1" />
          <stop offset="100%" stopColor={`var(--${tone})`} stopOpacity="1" />
        </linearGradient>
      </defs>
      <polyline fill="none" stroke={`url(#${gradientId})`} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={points} />
    </svg>
  );
}
