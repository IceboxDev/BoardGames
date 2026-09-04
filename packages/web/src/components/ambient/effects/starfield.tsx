import type { CSSProperties } from "react";
import { cn } from "../../../lib/cn";
import "./starfield.css";

// Ambient starfield (cheap tier): 62 scattered stars in three parallax tiers,
// plus four constellations whose lines connect real stars (the vertices are
// drawn in the same static SVG as the lines, so they can never drift apart
// from them).
//
// Each tier is ONE animated container with static star children, so the sky
// drifts as three parallax planes rather than 62 separate compositor layers.
// Only the ~18 twinkling stars carry an animation of their own. The twinkle
// is a pure opacity loop — the original's brightness-filter version was
// dropped so the effect stays compositor-only.

const CONSTELLATIONS: [number, number][][] = [
  [
    [12, 18],
    [16, 12],
    [22, 15],
    [18, 22],
    [12, 18],
  ],
  [
    [55, 8],
    [60, 14],
    [65, 10],
    [62, 5],
  ],
  [
    [78, 25],
    [82, 20],
    [88, 22],
    [85, 28],
    [78, 25],
  ],
  [
    [35, 70],
    [40, 65],
    [45, 72],
    [42, 78],
  ],
];

const CONSTELLATION_LINES = CONSTELLATIONS.flatMap((pts, ci) =>
  pts.slice(1).map((pt, li) => ({
    id: `c${ci}-l${li}`,
    x1: pts[li][0],
    y1: pts[li][1],
    x2: pt[0],
    y2: pt[1],
  })),
);

// The vertices themselves, deduped so a closed figure's repeated first point
// isn't drawn twice. These are the stars the lines actually join.
const CONSTELLATION_STARS = CONSTELLATIONS.flatMap((pts, ci) => {
  const seen = new Set<string>();
  return pts.flatMap((pt, pi) => {
    const key = `${pt[0]},${pt[1]}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ id: `c${ci}-v${pi}`, x: pt[0], y: pt[1] }];
  });
});

interface Star {
  id: string;
  x: number;
  y: number;
  size: number;
  opacity: number;
  twinkle: boolean;
  twinkleDelay: number;
}

function makeStars(
  count: number,
  prefix: string,
  size: number,
  opacity: number,
  twinkleChance: number,
): Star[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i}`,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size,
    opacity,
    twinkle: Math.random() < twinkleChance,
    twinkleDelay: -(Math.random() * 4),
  }));
}

// Geometry is randomized ONCE at module scope: the sky is a fixture of the
// theme, so it must not reshuffle when the host remounts the layer.
const STAR_TIERS = [
  { tier: "slow", stars: makeStars(24, "d", 1, 0.2, 0.15) },
  { tier: "med", stars: makeStars(23, "m", 1.5, 0.5, 0.3) },
  { tier: "fast", stars: makeStars(15, "b", 2.5, 0.85, 0.5) },
] as const;

// biome-ignore lint/style/useComponentExportOnlyModules: ambient effects export a { key, label, tier, Component } module contract, not a bare component
function Starfield() {
  return (
    <div aria-hidden className="amb-starfield absolute inset-0 overflow-hidden pointer-events-none">
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        role="presentation"
      >
        {CONSTELLATION_LINES.map((seg) => (
          <line
            key={seg.id}
            x1={`${seg.x1}%`}
            y1={`${seg.y1}%`}
            x2={`${seg.x2}%`}
            y2={`${seg.y2}%`}
            stroke="var(--color-accent-400)"
            strokeOpacity="0.15"
            strokeWidth="0.5"
          />
        ))}
        {CONSTELLATION_STARS.map((v) => (
          <circle
            key={v.id}
            className="amb-constellation-star"
            cx={`${v.x}%`}
            cy={`${v.y}%`}
            r="1.5"
          />
        ))}
      </svg>
      {STAR_TIERS.map((t) => (
        <div key={t.tier} className={`amb-star-tier amb-star-tier--${t.tier}`}>
          {t.stars.map((s) => (
            <div
              key={s.id}
              className={cn("amb-star", s.twinkle && "amb-star--twinkle")}
              style={
                {
                  left: `${s.x}%`,
                  top: `${s.y}%`,
                  width: `${s.size}px`,
                  height: `${s.size}px`,
                  "--amb-star-opacity": s.opacity,
                  "--amb-twinkle-delay": `${s.twinkleDelay}s`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      ))}
    </div>
  );
}

const starfield = {
  key: "starfield",
  label: "Starfield",
  tier: "cheap",
  Component: Starfield,
} as const;

export default starfield;
