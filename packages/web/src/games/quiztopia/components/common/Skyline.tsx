import { useId } from "react";
import { chartHex, useThemeVersion } from "../../../../components/ui/charts";
import { cn } from "../../../../lib/cn";
import { DISTRICTS } from "../../bands";
import { BuildingGlyph } from "./BuildingGlyph";

// The city as one picture: twelve buildings on a ground line under a night
// sky, each lit (its band colour, glowing windows, a halo) or dark (a grey
// silhouette). Trainer hub (lit = studied and nothing due), lobby preview
// (lit = starts bright), game over (all lit / all dark). Purely decorative —
// the tiles and cards beside it carry the accessible state. Nothing has a
// hard edge: the sky, ground, stars and halos sit under a mask that fades
// out towards both sides, and the ground dissolves downwards, so the city
// emerges from the page instead of sitting in a box.

type Mode = "trainer" | "mini" | "hero";

type Props = {
  lit: readonly boolean[];
  mode?: Mode;
  className?: string;
};

// Relative building heights, tallest in the middle-right so the skyline has
// a shape of its own rather than a row of equal blocks.
const HEIGHTS = [150, 130, 140, 145, 105, 165, 190, 155, 150, 115, 120, 165];
const GLYPH_ASPECT = 100 / 140;
const STARS = [
  [150, 34],
  [250, 58],
  [370, 18],
  [500, 44],
  [640, 24],
  [780, 56],
  [910, 20],
  [1040, 46],
  [1160, 30],
  [1300, 62],
];
const MOON_X = 1240;

export function Skyline({ lit, mode = "trainer", className }: Props) {
  useThemeVersion();
  const uid = useId();
  const glowId = `${uid}-glow`;
  const skyId = `${uid}-sky`;
  const moonId = `${uid}-moon`;
  const fadeId = `${uid}-fade`;
  const fadeMaskId = `${uid}-fade-mask`;
  const groundId = `${uid}-ground`;
  const w = 1440;
  const h = 260;
  const ground = h - 22;
  const scale = mode === "mini" ? 0.72 : 0.85;
  const gap = 12;
  const widths = HEIGHTS.map((hh) => hh * scale * GLYPH_ASPECT);
  const total = widths.reduce((a, b) => a + b, 0) + gap * (widths.length - 1);
  let cursor = (w - total) / 2;
  const layout = DISTRICTS.map((d, i) => {
    const bw = widths[i];
    const bh = HEIGHTS[i] * scale;
    const x = cursor;
    cursor += bw + gap;
    return { d, x, y: ground - bh, bw, bh };
  });
  const litCount = lit.filter(Boolean).length;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMax meet"
    >
      <defs>
        <radialGradient id={glowId} cx="50%" cy="70%" r="60%">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0.12" />
        </linearGradient>
        <linearGradient id={groundId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="1" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
        <mask id={moonId}>
          <rect width={w} height={h} fill="#fff" />
          <circle cx={MOON_X + 12} cy={46} r={22} fill="#000" />
        </mask>
        <linearGradient id={fadeId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="14%" stopColor="#fff" stopOpacity="1" />
          <stop offset="86%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={fadeMaskId} maskUnits="userSpaceOnUse" x={0} y={0} width={w} height={h}>
          <rect width={w} height={h} fill={`url(#${fadeId})`} />
        </mask>
      </defs>

      <g mask={`url(#${fadeMaskId})`}>
        {/* sky wash + a ground that dissolves downwards */}
        <rect width={w} height={ground} fill={`url(#${skyId})`} className="text-fg-strong" />
        <rect
          x={0}
          y={ground}
          width={w}
          height={h - ground}
          fill={`url(#${groundId})`}
          className="text-fill"
        />
        <line
          x1={0}
          x2={w}
          y1={ground}
          y2={ground}
          stroke="currentColor"
          strokeWidth={2}
          className="text-line-strong"
        />

        {/* stars fade as the city lights up; the moon stays */}
        {mode !== "mini" &&
          STARS.map(([x, y], i) => (
            <circle
              key={x}
              cx={x}
              cy={y}
              r={i % 3 === 0 ? 2 : 1.4}
              fill="currentColor"
              className="text-fg-muted transition-opacity duration-700 motion-reduce:transition-none"
              opacity={Math.max(0.12, 0.7 - (0.6 * litCount) / lit.length)}
            />
          ))}
        {mode !== "mini" && (
          <circle
            cx={MOON_X}
            cy={40}
            r={24}
            fill="currentColor"
            mask={`url(#${moonId})`}
            className="text-fg-muted"
            opacity={0.7}
          />
        )}

        {/* halos behind lit buildings, kept above the fading ground */}
        {layout.map(({ d, x, y, bw, bh }, i) =>
          lit[i] ? (
            <ellipse
              key={d.slug}
              cx={x + bw / 2}
              cy={y + bh * 0.58}
              rx={bw * 1.05}
              ry={bh * 0.55}
              fill={`url(#${glowId})`}
            />
          ) : null,
        )}
      </g>

      {layout.map(({ d, x, y, bw, bh }, i) => {
        const on = lit[i] ?? false;
        return (
          <BuildingGlyph
            key={d.slug}
            name={d.building}
            frame="ground"
            lit={on}
            x={x}
            y={y}
            width={bw}
            height={bh}
            style={{ color: on ? chartHex(d.tone) : undefined }}
            className={cn(
              "transition-opacity duration-500 motion-reduce:transition-none",
              !on && "text-fg-muted",
            )}
            opacity={on ? 1 : 0.42}
          />
        );
      })}
    </svg>
  );
}
