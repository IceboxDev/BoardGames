import { BoardLayer } from "../../../../components/board";

/**
 * Cockpit background — the "U" play-area outline that detours around the
 * cabin polygon. The panel gradient itself lives on `.cockpit-frame` (the
 * outer wrapper); this layer only adds the outline. Purely decorative.
 *
 * Outline path values from sky-team-lab/index.html:30 — traced 4 units
 * outside the cabin polygon so the stroke isn't hidden behind the cabin
 * chrome. Cabin geometry (height 100): top at y=880, top-of-wider-section
 * at y=902, right edge x=583. Offsets: 4 above wider top → y=898; slope
 * offset (3.37, -2.16) yields endpoints (77.87, 877.84) and (91.99, 899.84);
 * intersections at (90.81, 898) and (86.4, 891.13).
 */
export default function CockpitBackground() {
  return (
    <BoardLayer name="cockpit-background" z={0} aria-hidden>
      {/* "U" outline — detours around the cabin polygon. */}
      <path
        d="M 94.4 100 L 625.6 100 Q 633.6 100 633.6 108 L 633.6 962 Q 633.6 970 625.6 970 L 587.2 970 L 587.2 898 L 90.81 898 L 86.4 891.13 L 86.4 108 Q 86.4 100 94.4 100 Z"
        fill="none"
        stroke="rgb(57 70 69 / 0.25)"
        strokeWidth={3}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </BoardLayer>
  );
}
