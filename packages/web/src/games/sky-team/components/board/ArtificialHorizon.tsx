import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { useId } from "react";
import { BoardLayer } from "../../../../components/board";
import { ARTIFICIAL_HORIZON } from "./geometry";

interface Props {
  view: SkyTeamPlayerView;
}

/**
 * Artificial-horizon dial — sky-over-ground face with a white plane silhouette
 * fixed in the centre, a bezel ring on the TOP HALF only (the bottom of the
 * dial is open so the axis arc can wrap around it), and a tilt animation
 * driven by `view.axis.position`.
 *
 * Matches sky-team-lab `.horizon`, `.horizon__bezel`, `.horizon__face`,
 * `.horizon__plane` — same gradient stops, same ±85° bezel arc, same plane.
 */
export default function ArtificialHorizon({ view }: Props) {
  const { center, outerRadius, faceRadius, bezelThickness } = ARTIFICIAL_HORIZON;
  const tiltDeg = (view.axis.position / view.axis.spinAt) * 35;

  const faceClipId = useId();
  const faceGradId = useId();

  // Bezel band — top 170° (±85° from 12 o'clock). Math-convention angles where
  // 0°=right, 90°=up. Endpoints at +5° (right, just above horizontal) and
  // +175° (left, just above horizontal).
  const ANGLE_RIGHT = 5;
  const ANGLE_LEFT = 175;
  const angleRad = (deg: number) => (deg * Math.PI) / 180;
  const pointOnCircle = (r: number, deg: number) => ({
    x: center.x + r * Math.cos(angleRad(deg)),
    y: center.y - r * Math.sin(angleRad(deg)),
  });
  const outerLeft = pointOnCircle(outerRadius, ANGLE_LEFT);
  const outerRight = pointOnCircle(outerRadius, ANGLE_RIGHT);
  const innerRadius = outerRadius - bezelThickness;
  const innerLeft = pointOnCircle(innerRadius, ANGLE_LEFT);
  const innerRight = pointOnCircle(innerRadius, ANGLE_RIGHT);
  const bezelPath =
    `M ${outerLeft.x} ${outerLeft.y}` +
    ` A ${outerRadius} ${outerRadius} 0 0 1 ${outerRight.x} ${outerRight.y}` +
    ` L ${innerRight.x} ${innerRight.y}` +
    ` A ${innerRadius} ${innerRadius} 0 0 0 ${innerLeft.x} ${innerLeft.y}` +
    " Z";

  // Plane silhouette proportions (matching lab `.horizon__plane`):
  //   plane element: width 50% of dial, height 22%, centred at (50%, 48%)
  //   fuselage: horizontal bar at the horizon line, ~50% wide × 4% tall
  //   stabilizer: up-pointing triangle, base on fuselage, ~12% wide × 18% tall
  const planeOffsetY = -faceRadius * 0.04; // 48% of horizon → -2% from centre
  const fuselageW = faceRadius * 1.0;
  const fuselageH = faceRadius * 0.07;
  const stabilizerH = faceRadius * 0.32;
  const stabilizerHalfW = faceRadius * 0.08;

  return (
    <BoardLayer name="artificial-horizon" z={2}>
      <defs>
        <clipPath id={faceClipId}>
          <circle cx={center.x} cy={center.y} r={faceRadius} />
        </clipPath>
        <linearGradient id={faceGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#24b7e7" />
          <stop offset="48%" stopColor="#24b7e7" />
          <stop offset="48%" stopColor="#f3eee1" />
          <stop offset="51%" stopColor="#f3eee1" />
          <stop offset="51%" stopColor="#8b633e" />
          <stop offset="100%" stopColor="#6a4830" />
        </linearGradient>
      </defs>

      {/* Dial face (clipped to circle, rotates with tilt) */}
      <g
        clipPath={`url(#${faceClipId})`}
        style={{
          transform: `rotate(${tiltDeg}deg)`,
          transformOrigin: `${center.x}px ${center.y}px`,
          transition: "transform 240ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <rect
          x={center.x - faceRadius - 40}
          y={center.y - faceRadius - 40}
          width={faceRadius * 2 + 80}
          height={faceRadius * 2 + 80}
          fill={`url(#${faceGradId})`}
        />
      </g>

      {/* Bezel — top half only */}
      <path
        d={bezelPath}
        fill="#15191d"
        stroke="#485151"
        strokeWidth={1}
        style={{ filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.28))" }}
      />

      {/* Plane silhouette (fixed; doesn't rotate with the dial) */}
      <g pointerEvents="none" style={{ filter: "drop-shadow(0 3px 2px rgba(0,0,0,0.28))" }}>
        <rect
          x={center.x - fuselageW / 2}
          y={center.y + planeOffsetY - fuselageH / 2}
          width={fuselageW}
          height={fuselageH}
          rx={fuselageH / 2}
          ry={fuselageH / 2}
          fill="white"
        />
        <polygon
          points={`${center.x - stabilizerHalfW},${center.y + planeOffsetY} ${center.x + stabilizerHalfW},${center.y + planeOffsetY} ${center.x},${center.y + planeOffsetY - stabilizerH}`}
          fill="white"
        />
      </g>
    </BoardLayer>
  );
}
