import { useId } from "react";
import { BoardLayer } from "../../../../components/board";

/**
 * Cockpit background — the "U" play-area outline that detours around the cabin
 * polygon, PLUS a bright brushed-metal fill inside it. The dark military frame
 * (the area OUTSIDE this outline — side strips, HUD, cabin, margins) lives on
 * `.cockpit-frame`; this SVG fill brightens just the central play area so it
 * reads as a polished metal panel inset into the darker chassis.
 *
 * Outline path values from sky-team-lab/index.html:30 — traced 4 units outside
 * the cabin polygon. Cabin geometry (height 100): top at y=880, top-of-wider-
 * section at y=902, right edge x=583.
 */
const U_PATH =
  "M 94.4 100 L 625.6 100 Q 633.6 100 633.6 108 L 633.6 962 Q 633.6 970 625.6 970 L 587.2 970 L 587.2 898 L 90.81 898 L 86.4 891.13 L 86.4 108 Q 86.4 100 94.4 100 Z";

export default function CockpitBackground() {
  const baseId = useId();
  const sheenId = useId();
  const brushedId = useId();

  return (
    <BoardLayer name="cockpit-background" z={0} aria-hidden>
      <defs>
        {/* Metal base — brighter than the dark military frame, but muted so it
            doesn't clash. */}
        <linearGradient id={baseId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c4d2cd" />
          <stop offset="0.5" stopColor="#aabbb5" />
          <stop offset="1" stopColor="#c8d5d0" />
        </linearGradient>
        {/* Diagonal sheen — a soft reflective streak across the panel. */}
        <linearGradient id={sheenId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.16" />
          <stop offset="0.35" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.7" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0.1" />
        </linearGradient>
        {/* Fine vertical brushed-metal grain. */}
        <pattern id={brushedId} width="3" height="8" patternUnits="userSpaceOnUse">
          <rect x="0" width="1" height="8" fill="#ffffff" fillOpacity="0.1" />
          <rect x="1.5" width="1" height="8" fill="#000000" fillOpacity="0.06" />
        </pattern>
      </defs>

      {/* Bright brushed-metal panel inside the play-area outline. */}
      <path d={U_PATH} fill={`url(#${baseId})`} />
      <path d={U_PATH} fill={`url(#${brushedId})`} />
      <path d={U_PATH} fill={`url(#${sheenId})`} />

      {/* "U" outline on top — detours around the cabin polygon. */}
      <path
        d={U_PATH}
        fill="none"
        stroke="rgb(57 70 69 / 0.35)"
        strokeWidth={3}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </BoardLayer>
  );
}
