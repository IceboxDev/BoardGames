import type { SkillChart } from "@boardgames/core/protocol";
import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import { DEFAULT_ACCENT } from "../../lib/accent.ts";
import { polyline } from "../board/svg-paths.ts";
import type { BoardPoint } from "../board/types.ts";
import { SparkleIcon } from "../icons";
import { Surface } from "../ui/Surface.tsx";

// Non-editable radar/spider chart of a player's skill profile. Axis labels AND
// values are data-driven — they come from `skill` (generated later by a trusted
// job). While `skill` is null we render a ghosted grid + an unlock caption
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
  /**
   * Extra per-axis tooltip content (same order as `skill.axes`) — e.g. rank
   * and which games train the trait. Rendered under the default line.
   */
  axisDetails?: readonly (ReactNode | null)[];
};

export function HexSkillChart({ skill, accentHex, axisDetails }: HexSkillChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);
  const axes = skill?.axes ?? null;
  const count = axes?.length ?? GHOST_AXES;
  const style = { "--accent": accentHex ?? DEFAULT_ACCENT } as CSSProperties;

  const valuePoints = axes?.map((axis, i) => vertex(i, count, RADIUS * axis.value)) ?? [];

  return (
    <div className="relative mx-auto w-full max-w-70" style={style}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        // overflow-visible: axis labels sit outside the viewBox at the left/
        // right extremes ("Dexterity", "Perception") and must not clip.
        className={`w-full overflow-visible ${axes ? "" : "opacity-40"}`}
        role="img"
        aria-label={axes ? "Skill profile chart" : "Skill profile locked"}
      >
        <title>{axes ? "Skill profile" : "Skill profile locked"}</title>

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
              <circle
                key={`dot-${axes[i].label}`}
                cx={p.x}
                cy={p.y}
                r={hovered === i ? 4.5 : 3}
                fill="var(--accent)"
                fillOpacity={axes[i].provisional ? 0.35 : 1}
              />
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
                  // Provisional axes (too little evidence to rank) read dimmer.
                  className={`fill-fg-muted text-5xs font-semibold ${axis.provisional ? "opacity-50" : ""} ${hovered === i ? "fill-fg-primary" : ""}`}
                >
                  {axis.label}
                </text>
              );
            })}
            {/* Invisible hover/tap lanes covering each FULL axis — center to
                past the label — so the value dot (which sits at value·RADIUS,
                well inside the hexagon) is always inside its lane. Kept last
                so they sit above every painted layer. */}
            {axes.map((axis, i) => {
              const reach = vertex(i, count, RADIUS + 24);
              return (
                // biome-ignore lint/a11y/noStaticElementInteractions: decorative hover/tap hotspot — the same data renders accessibly in the trait rows
                <line
                  key={`hit-${axis.label}`}
                  x1={CENTER}
                  y1={CENTER}
                  x2={reach.x}
                  y2={reach.y}
                  stroke="transparent"
                  strokeWidth={34}
                  strokeLinecap="round"
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => setHovered(hovered === i ? null : i)}
                />
              );
            })}
          </>
        )}
      </svg>

      {/* Hover tooltip — HTML so it never scales with the SVG. Positioned by
          the hovered axis' value point in viewBox-percent coordinates. */}
      {axes && hovered !== null && axes[hovered] && (
        <Surface
          variant="raised"
          padding="none"
          // Solid background (readable over the chart) and a width cap so
          // long "sharpened by" game titles wrap instead of blowing the
          // bubble past the card.
          className="pointer-events-none absolute z-10 w-max max-w-52 -translate-x-1/2 -translate-y-full bg-surface-900 px-2.5 py-1.5 text-center shadow-xl shadow-black/40"
          style={{
            left: `${(valuePoints[hovered].x / SIZE) * 100}%`,
            top: `${(valuePoints[hovered].y / SIZE) * 100 - 3}%`,
          }}
        >
          <p className="text-2xs font-semibold text-fg-primary">{axes[hovered].label}</p>
          <p className="text-3xs tabular-nums text-fg-muted">
            {axes[hovered].provisional
              ? "not rated yet — needs more games"
              : `Score ${Math.round(axes[hovered].value * 100)} of 100`}
          </p>
          {!axes[hovered].provisional && axes[hovered].winChance !== undefined && (
            <p className="text-3xs tabular-nums text-fg-muted">
              beats the average player {axes[hovered].winChance}% of the time
            </p>
          )}
          {axisDetails?.[hovered]}
        </Surface>
      )}

      {!axes && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-center">
          <SparkleIcon className="h-5 w-5 text-accent-300/70" />
          <p className="text-2xs font-semibold uppercase tracking-pill text-fg-secondary">
            Skill profile
          </p>
          {/* Not "coming soon" — unlocking it is entirely in the player's
              hands (play more rated games), never a missing feature. */}
          <p className="text-3xs text-fg-muted">Unlocks with more rated games</p>
        </div>
      )}
    </div>
  );
}
