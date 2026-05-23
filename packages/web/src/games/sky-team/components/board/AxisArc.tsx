import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { BoardLayer } from "../../../../components/board";
import { ARTIFICIAL_HORIZON } from "./geometry";

interface Props {
  view: SkyTeamPlayerView;
}

// Axis arc — markers laid on the horizon bezel (the top half of the dial
// window). 5 down-pointing isoceles triangles at 0%, ±25%, ±50%; 2 red X
// warnings at ±75%. All rotated radially so their apex points toward the
// dial centre.
//
// Position convention: offsetPct is the percentage along the half-arc from
// the centre (0% = top of bezel, ±100% would be the bezel ends). The bezel
// spans ±85° from the top, so the math angle of a marker is:
//     theta_math = 90 - (offsetPct / 100) * 85
// Positive offsetPct goes to the right side of the dial.

const TRIANGLE_MARKERS: ReadonlyArray<{ offsetPct: number; filled: boolean }> = [
  { offsetPct: -58, filled: true },
  { offsetPct: -29, filled: true },
  { offsetPct: 0, filled: false },
  { offsetPct: 29, filled: true },
  { offsetPct: 58, filled: true },
];

const X_MARKERS: ReadonlyArray<{ offsetPct: number }> = [{ offsetPct: -87 }, { offsetPct: 87 }];

const BEZEL_HALF_ANGLE = 85; // degrees from top (bezel spans ±85°)

const MARKER_COLOR = "white";
const X_COLOR = "#ef4444";

// Triangle: base 8 wide, height 11 → sides ≈ 11.7 (~1.5× base). Squatter
// still than the previous 1.8× version. Apex at local (0, 0); base above
// at (±4, -11).
const TRIANGLE_HEIGHT = 11;
const TRIANGLE_POINTS = `-4,${-TRIANGLE_HEIGHT} 4,${-TRIANGLE_HEIGHT} 0,0`;

/**
 * Axis arc — overlays the horizon bezel with position markers. The bezel
 * itself is drawn inside `ArtificialHorizon.tsx`; this component just adds
 * the indicators on top.
 */
export default function AxisArc(_props: Props) {
  const { center, outerRadius, bezelThickness } = ARTIFICIAL_HORIZON;

  // Place markers across the bezel band. Triangles float in the VERTICAL
  // MIDDLE of the band: apex at `centerLine − halfHeight`, base at
  // `centerLine + halfHeight`. X marks centre on the band centerline.
  const innerR = outerRadius - bezelThickness;
  const bezelCenterR = (outerRadius + innerR) / 2;
  const triangleApexR = bezelCenterR - TRIANGLE_HEIGHT / 2;

  // Convert (offsetPct, radius) → SVG (x, y) + rotation angle in degrees.
  // Math angle: theta = 90 - (offsetPct/100)*85.
  // SVG position: (cx + r·cos(θ), cy − r·sin(θ)).
  // Rotation (so apex points inward): rot = 90 − θ.
  const placeMarker = (offsetPct: number, r: number) => {
    const theta = 90 - (offsetPct / 100) * BEZEL_HALF_ANGLE;
    const thetaRad = (theta * Math.PI) / 180;
    return {
      x: center.x + r * Math.cos(thetaRad),
      y: center.y - r * Math.sin(thetaRad),
      rotation: 90 - theta,
    };
  };

  return (
    <BoardLayer name="axis-arc" z={4}>
      {TRIANGLE_MARKERS.map(({ offsetPct, filled }) => {
        const { x, y, rotation } = placeMarker(offsetPct, triangleApexR);
        return (
          <polygon
            key={`tri-${offsetPct}`}
            points={TRIANGLE_POINTS}
            transform={`translate(${x}, ${y}) rotate(${rotation})`}
            fill={filled ? MARKER_COLOR : "transparent"}
            stroke={MARKER_COLOR}
            strokeWidth={1.8}
            strokeLinejoin="round"
            style={{ filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.5))" }}
          />
        );
      })}

      {X_MARKERS.map(({ offsetPct }) => {
        const { x, y, rotation } = placeMarker(offsetPct, bezelCenterR);
        return (
          <g
            key={`x-${offsetPct}`}
            transform={`translate(${x}, ${y}) rotate(${rotation})`}
            stroke={X_COLOR}
            strokeWidth={2.8}
            strokeLinecap="round"
            style={{ filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.5))" }}
          >
            <line x1={-7} y1={-7} x2={7} y2={7} />
            <line x1={-7} y1={7} x2={7} y2={-7} />
          </g>
        );
      })}
    </BoardLayer>
  );
}
