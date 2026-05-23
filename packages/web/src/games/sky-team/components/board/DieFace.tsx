import type { DieColor, DieValue } from "@boardgames/core/games/sky-team/types";
import { useId } from "react";

/**
 * A physically-styled Sky Team die: a rounded, bevelled cube face with
 * standard engraved pips. Scales to fill its container (viewBox 0–100) so it
 * stays crisp at any board size. Pilot dice are blue, copilot dice orange —
 * matching the dice tray. Depth shadow + colored glow live in cockpit.css on
 * the wrapping `.cockpit-placed-die` so the SVG itself stays self-contained.
 */

// Standard die pip layout on a 100×100 face (col/row centres at 30 / 50 / 70).
const PIPS: Record<DieValue, ReadonlyArray<readonly [number, number]>> = {
  1: [[50, 50]],
  2: [
    [32, 32],
    [68, 68],
  ],
  3: [
    [32, 32],
    [50, 50],
    [68, 68],
  ],
  4: [
    [32, 32],
    [68, 32],
    [32, 68],
    [68, 68],
  ],
  5: [
    [32, 32],
    [68, 32],
    [50, 50],
    [32, 68],
    [68, 68],
  ],
  6: [
    [32, 30],
    [68, 30],
    [32, 50],
    [68, 50],
    [32, 70],
    [68, 70],
  ],
};

interface Palette {
  light: string;
  mid: string;
  dark: string;
  edge: string;
}

const PALETTE: Record<DieColor, Palette> = {
  blue: { light: "#6d8bff", mid: "#3450d4", dark: "#1b2a8e", edge: "#aebcff" },
  orange: { light: "#ffb066", mid: "#f07d22", dark: "#bf4e0c", edge: "#ffd6a3" },
};

interface Props {
  color: DieColor;
  value: DieValue;
  className?: string;
}

export default function DieFace({ color, value, className }: Props) {
  const id = useId();
  const bodyId = `df-body-${id}`;
  const sheenId = `df-sheen-${id}`;
  const pipId = `df-pip-${id}`;
  const p = PALETTE[color];

  return (
    <svg
      className={className}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`${color} die showing ${value}`}
    >
      <defs>
        <linearGradient id={bodyId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={p.light} />
          <stop offset="0.55" stopColor={p.mid} />
          <stop offset="1" stopColor={p.dark} />
        </linearGradient>
        {/* Top-left light wash for the bevel highlight. */}
        <linearGradient id={sheenId} x1="0" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
          <stop offset="0.4" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        {/* Engraved pip: bright centre, faint grey rim. */}
        <radialGradient id={pipId} cx="0.4" cy="0.35" r="0.75">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.7" stopColor="#eef1f8" />
          <stop offset="1" stopColor="#c4ccdc" />
        </radialGradient>
      </defs>

      {/* Body + dark edge for definition against same-colored tiles. */}
      <rect x="8" y="8" width="84" height="84" rx="18" fill={`url(#${bodyId})`} />
      <rect
        x="8"
        y="8"
        width="84"
        height="84"
        rx="18"
        fill={`url(#${sheenId})`}
        style={{ mixBlendMode: "screen" }}
      />
      <rect
        x="9"
        y="9"
        width="82"
        height="82"
        rx="17"
        fill="none"
        stroke={p.edge}
        strokeOpacity="0.45"
        strokeWidth="1.4"
      />
      <rect
        x="8"
        y="8"
        width="84"
        height="84"
        rx="18"
        fill="none"
        stroke={p.dark}
        strokeWidth="2"
      />

      {/* Pips: a soft drop shadow below + the engraved cap. */}
      {PIPS[value].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy + 1.2} r="8.6" fill="rgba(0,0,0,0.28)" />
          <circle cx={cx} cy={cy} r="8.6" fill={`url(#${pipId})`} />
          <circle cx={cx} cy={cy} r="8.6" fill="none" stroke="rgba(0,0,0,0.18)" strokeWidth="0.8" />
        </g>
      ))}
    </svg>
  );
}
