import type { SkillChart } from "@boardgames/core/protocol";
import { motion } from "framer-motion";
import type { CSSProperties } from "react";
import { polyline } from "../board/svg-paths.ts";
import type { BoardPoint } from "../board/types.ts";
import { SparkleIcon } from "../icons";

// Non-editable radar/spider chart of a player's skill profile. Axis labels AND
// values are data-driven — they come from `skill` (generated later by a trusted
// job). While `skill` is null we render a ghosted grid + "coming soon" caption
// in the same footprint so the layout never shifts when it lands.
//
// SVG with a fixed viewBox scales fluidly, so the chart is responsive by
// construction; the caller caps the container width per breakpoint.

const SIZE = 240;
const CENTER = SIZE / 2;
const RADIUS = 84;
const RINGS = [0.25, 0.5, 0.75, 1] as const;
const GHOST_AXES = 6;

function vertex(index: number, count: number, radius: number): BoardPoint {
  const angle = ((-90 + (index * 360) / count) * Math.PI) / 180;
  return { x: CENTER + radius * Math.cos(angle), y: CENTER + radius * Math.sin(angle) };
}

function closedPath(points: BoardPoint[]): string {
  return `${polyline(points)} Z`;
}

function ringPath(count: number, factor: number): string {
  return closedPath(Array.from({ length: count }, (_, i) => vertex(i, count, RADIUS * factor)));
}

type HexSkillChartProps = {
  skill: SkillChart;
  accentHex?: string | null;
};

export function HexSkillChart({ skill, accentHex }: HexSkillChartProps) {
  const axes = skill?.axes ?? null;
  const count = axes?.length ?? GHOST_AXES;
  const style = { "--accent": accentHex ?? "#6366f1" } as CSSProperties;

  const valuePoints = axes?.map((axis, i) => vertex(i, count, RADIUS * axis.value)) ?? [];

  return (
    <div className="relative mx-auto w-full max-w-[280px]" style={style}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={`w-full ${axes ? "" : "opacity-40"}`}
        role="img"
        aria-label={axes ? "Skill profile chart" : "Skill profile not yet generated"}
      >
        <title>{axes ? "Skill profile" : "Skill profile coming soon"}</title>

        {/* Grid rings */}
        {RINGS.map((factor) => (
          <path
            key={factor}
            d={ringPath(count, factor)}
            fill="none"
            stroke="currentColor"
            className="text-white/10"
            strokeWidth={1}
          />
        ))}

        {/* Spokes */}
        {Array.from({ length: count }, (_, i) => {
          const tip = vertex(i, count, RADIUS);
          const angleDeg = -90 + (i * 360) / count;
          return (
            <line
              key={`spoke-${angleDeg}`}
              x1={CENTER}
              y1={CENTER}
              x2={tip.x}
              y2={tip.y}
              stroke="currentColor"
              className="text-white/10"
              strokeWidth={1}
            />
          );
        })}

        {/* Value polygon + dots + labels (only when generated) */}
        {axes && (
          <>
            <motion.path
              d={closedPath(valuePoints)}
              fill="var(--accent)"
              fillOpacity={0.22}
              stroke="var(--accent)"
              strokeWidth={2}
              strokeLinejoin="round"
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: "spring", stiffness: 120, damping: 18 }}
              style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
            />
            {valuePoints.map((p, i) => (
              <circle key={`dot-${axes[i].label}`} cx={p.x} cy={p.y} r={3} fill="var(--accent)" />
            ))}
            {axes.map((axis, i) => {
              const labelPoint = vertex(i, count, RADIUS + 18);
              const dx = labelPoint.x - CENTER;
              const anchor = dx > 12 ? "start" : dx < -12 ? "end" : "middle";
              return (
                <text
                  key={`label-${axis.label}`}
                  x={labelPoint.x}
                  y={labelPoint.y}
                  textAnchor={anchor}
                  dominantBaseline="middle"
                  className="fill-fg-muted text-[9px] font-semibold"
                >
                  {axis.label}
                </text>
              );
            })}
          </>
        )}
      </svg>

      {!axes && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
          <SparkleIcon className="h-5 w-5 text-accent-300/70" />
          <p className="text-2xs font-semibold uppercase tracking-[0.18em] text-fg-secondary">
            Skill profile
          </p>
          <p className="text-3xs text-fg-muted">Coming soon</p>
        </div>
      )}
    </div>
  );
}
