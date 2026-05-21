import { BoardLayer } from "../../../../components/board";
import { COCKPIT_VIEWBOX, SIDE_STRIP_WIDTH } from "./geometry";

/**
 * Cockpit background — central seam, side-strip dividers, and the "U"
 * play-area outline that detours around the cabin polygon. The panel gradient
 * itself lives on `.cockpit-frame` (the outer wrapper); this layer only adds
 * the chrome lines. Purely decorative.
 *
 * Outline path values from sky-team-lab/index.html:30 — traced 4 units
 * outside the cabin polygon so the stroke isn't hidden behind the cabin
 * chrome. Cabin perimeter: cabin top at y=855, slope upper-left endpoint
 * (74.5, 855), slope lower-right endpoint (88.6, 882.5), cabin right edge
 * x=583. Offset 4 units yields the literal path below.
 */
export default function CockpitBackground() {
  return (
    <BoardLayer name="cockpit-background" z={0} aria-hidden>
      {/* Central seam — two-seat split line */}
      <line
        x1={COCKPIT_VIEWBOX.width / 2}
        y1={0}
        x2={COCKPIT_VIEWBOX.width / 2}
        y2={COCKPIT_VIEWBOX.height}
        stroke="rgb(255 255 255 / 0.28)"
        strokeWidth={2}
      />
      {/* Side-strip dividers */}
      <line
        x1={SIDE_STRIP_WIDTH}
        y1={0}
        x2={SIDE_STRIP_WIDTH}
        y2={COCKPIT_VIEWBOX.height}
        stroke="rgb(57 70 69 / 0.25)"
        strokeWidth={1.5}
      />
      <line
        x1={COCKPIT_VIEWBOX.width - SIDE_STRIP_WIDTH}
        y1={0}
        x2={COCKPIT_VIEWBOX.width - SIDE_STRIP_WIDTH}
        y2={COCKPIT_VIEWBOX.height}
        stroke="rgb(57 70 69 / 0.25)"
        strokeWidth={1.5}
      />
      {/* "U" outline — detours around the cabin polygon, 4 units outside its
          perimeter. Cabin geometry (height 100): top at y=880, top-of-wider-
          section at y=902, right edge x=583. Offsets: 4 above wider top →
          y=898; slope offset (3.37, -2.16) yields endpoints (77.87, 877.84)
          and (91.99, 899.84); intersections at (90.81, 898) and (86.4,
          891.13). */}
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
