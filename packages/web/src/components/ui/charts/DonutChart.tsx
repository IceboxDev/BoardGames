import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "../../../lib/cn";
import type { Tone } from "../tones";
import { resolveChartColor } from "./tone-hex";

interface DonutSegment {
  value: number;
  /** Explicit hex/hsl fill; wins over `tone`. */
  color?: string;
  /** Tone-vocabulary fill (default `accent`). */
  tone?: Tone;
  label?: string;
}

interface DonutChartProps {
  segments: DonutSegment[];
  /** Outer diameter in px (default 120). */
  size?: number;
  /** Ring thickness in px (default 12). */
  thickness?: number;
  /** Centered content — the headline figure ("9 / 13", "62%"). */
  children?: ReactNode;
  className?: string;
}

/**
 * Segmented ring with a center slot. Zero-total data renders a neutral track
 * so the layout never collapses. Arcs draw in on mount (framer-motion), same
 * spirit as `HexSkillChart`'s polygon animation.
 */
export function DonutChart({
  segments,
  size = 120,
  thickness = 12,
  children,
  className,
}: DonutChartProps) {
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  let acc = 0;
  const arcs = segments
    .filter((seg) => seg.value > 0)
    .map((seg, i) => {
      const frac = seg.value / total;
      const start = acc;
      acc += frac;
      return { seg, frac, start, key: `${i}-${seg.label ?? ""}` };
    });

  return (
    <div
      className={cn("relative inline-flex items-center justify-center", className)}
      style={{ width: size, height: size }}
    >
      <svg aria-hidden="true" width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={thickness}
        />
        {total > 0 &&
          arcs.map(({ seg, frac, start, key }) => (
            <motion.circle
              key={key}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={resolveChartColor(seg.color, seg.tone)}
              strokeWidth={thickness}
              strokeDashoffset={-start * circumference}
              initial={{ strokeDasharray: `0 ${circumference}` }}
              animate={{ strokeDasharray: `${frac * circumference} ${circumference}` }}
              transition={{ duration: 0.7, ease: "easeOut", delay: 0.1 + start * 0.3 }}
            >
              {seg.label ? <title>{`${seg.label}: ${seg.value}`}</title> : null}
            </motion.circle>
          ))}
      </svg>
      {children && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          {children}
        </div>
      )}
    </div>
  );
}
