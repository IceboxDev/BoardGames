import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { useReducedMotion } from "framer-motion";
import { useId } from "react";
import { BoardLayer } from "../../../../components/board";
import { ARTIFICIAL_HORIZON } from "./geometry";
import Plane from "./Plane";

interface Props {
  view: SkyTeamPlayerView;
}

// Ease-in / tilt / ease-out for the bank. Plain CSS transition (not
// framer-motion) so our `transform-origin` is honoured — framer overrides it
// with its bounding-box centre, which threw the pivot off the dial centre.
const TILT_TRANSITION = "transform 0.9s cubic-bezier(0.45, 0, 0.55, 1)";

// One axis unit = one bezel-marker step. The axis-arc markers sit at offsets
// 29% apart over a ±85° half-arc, so each tick is (29/100)·85 ≈ 24.65°. The
// level pointer therefore lands exactly on the marker for the current axis
// position (and on the red X at ±3, one step from a spin).
const DEG_PER_AXIS_TICK = (29 / 100) * 85;

// Pitch-ladder rungs as fractions of `faceRadius`. Negative y = above horizon.
// `wFrac` = half-width relative to faceRadius; major rungs longer than minor.
const PITCH_RUNGS: ReadonlyArray<{ y: number; wFrac: number; major: boolean }> = [
  { y: -0.42, wFrac: 0.18, major: false },
  { y: -0.32, wFrac: 0.32, major: true },
  { y: -0.22, wFrac: 0.1, major: false },
  { y: -0.12, wFrac: 0.22, major: false },
  { y: 0.12, wFrac: 0.22, major: false },
  { y: 0.22, wFrac: 0.1, major: false },
  { y: 0.32, wFrac: 0.32, major: true },
  { y: 0.42, wFrac: 0.18, major: false },
];

/**
 * Artificial-horizon dial. The dial face, frame and bezel are STATIC; the
 * level-pointer triangle and the plane silhouette rotate together around the
 * dial centre to reflect `view.axis.position` (the bank). When both axis dice
 * are placed the position changes by their difference, so the plane eases over
 * to the new tilt toward the heavier die's side.
 *
 * Composition (back-to-front):
 *   1. Sky gradient (top half) + ground gradient (bottom half)
 *   2. Warm horizon highlight band straddling the meeting line
 *   3. Static pitch-ladder rungs etched on the "glass"
 *   4. Radial vignette darkening the edges for depth
 *   5. Black frame around the dial face
 *   6. Bezel band — top 170° only, leaving the lower face open for the speed arc
 *   7. Rotating group (pivot = dial centre): level-pointer triangle + plane
 */
export default function ArtificialHorizon({ view }: Props) {
  const { center, outerRadius, faceRadius, bezelThickness } = ARTIFICIAL_HORIZON;
  const reduceMotion = useReducedMotion();

  // Bank angle. Heavier die's side dips: pilot (top-left slot) heavier →
  // axis.position > 0 → bank left (counter-clockwise / negative); copilot
  // (top-right) heavier → bank right (clockwise / positive).
  const tiltDeg = -view.axis.position * DEG_PER_AXIS_TICK;

  const faceClipId = useId();
  const skyGradId = useId();
  const groundGradId = useId();
  const horizonGradId = useId();
  const vignetteId = useId();

  // Bezel band — top 170° (±85° from 12 o'clock). Drawn as a CLOSED band
  // (outer arc → right cap → inner arc → left cap) so the four corners at
  // the band ends can be rounded via `stroke-linejoin="round"` with a
  // same-colour stroke — corners get a small chamfer but the ends stay flat.
  const ANGLE_RIGHT = 5;
  const ANGLE_LEFT = 175;
  const angleRad = (deg: number) => (deg * Math.PI) / 180;
  const pointOnCircle = (r: number, deg: number) => ({
    x: center.x + r * Math.cos(angleRad(deg)),
    y: center.y - r * Math.sin(angleRad(deg)),
  });
  const innerRadius = outerRadius - bezelThickness;
  const outerLeft = pointOnCircle(outerRadius, ANGLE_LEFT);
  const outerRight = pointOnCircle(outerRadius, ANGLE_RIGHT);
  const innerLeft = pointOnCircle(innerRadius, ANGLE_LEFT);
  const innerRight = pointOnCircle(innerRadius, ANGLE_RIGHT);
  const bezelBandPath =
    `M ${outerLeft.x} ${outerLeft.y}` +
    ` A ${outerRadius} ${outerRadius} 0 0 1 ${outerRight.x} ${outerRight.y}` +
    ` L ${innerRight.x} ${innerRight.y}` +
    ` A ${innerRadius} ${innerRadius} 0 0 0 ${innerLeft.x} ${innerLeft.y}` +
    " Z";

  // Plane silhouette — rendered through the `<Plane>` component (viewBox now
  // centred on the plane's centroid). Sized so the plane can bank to the
  // ±3 extreme without its wingtips swinging outside the dial face (it's
  // also clipped to the face as a hard safety). With the centroid-centred
  // viewBox the plane's visual weight lands at the SVG centre, so no y-offset
  // is needed — it sits on the horizon line at the dial centre.
  const PLANE_BOX = 290;
  const PLANE_Y_OFFSET = 0;

  return (
    <BoardLayer name="artificial-horizon" z={2}>
      <defs>
        <clipPath id={faceClipId}>
          <circle cx={center.x} cy={center.y} r={faceRadius} />
        </clipPath>

        {/* Sky — bright cyan at the top, deepening as it approaches the horizon. */}
        <linearGradient id={skyGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a3e3f7" />
          <stop offset="40%" stopColor="#3ab9e8" />
          <stop offset="80%" stopColor="#1d7ea8" />
          <stop offset="100%" stopColor="#155b7e" />
        </linearGradient>

        {/* Ground — warm sienna at the horizon, dropping to a deep loam at the bottom. */}
        <linearGradient id={groundGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c87a40" />
          <stop offset="20%" stopColor="#9b5a30" />
          <stop offset="60%" stopColor="#6c3c20" />
          <stop offset="100%" stopColor="#2e1a0e" />
        </linearGradient>

        {/* Horizon — thin warm bloom blending sky into ground (replaces the
            hard cream stripe). Transparent at the edges, peak amber in the
            middle. */}
        <linearGradient id={horizonGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(255 220 170 / 0)" />
          <stop offset="40%" stopColor="rgb(255 232 188 / 0.55)" />
          <stop offset="50%" stopColor="rgb(255 240 205 / 0.85)" />
          <stop offset="60%" stopColor="rgb(255 220 170 / 0.55)" />
          <stop offset="100%" stopColor="rgb(255 200 140 / 0)" />
        </linearGradient>

        {/* Subtle radial vignette — darkens the corners of the dial. */}
        <radialGradient id={vignetteId} cx="50%" cy="50%" r="55%">
          <stop offset="55%" stopColor="rgb(0 0 0 / 0)" />
          <stop offset="100%" stopColor="rgb(0 0 0 / 0.45)" />
        </radialGradient>
      </defs>

      {/* ====== Dial face (STATIC — no rotation) ====== */}
      <g clipPath={`url(#${faceClipId})`}>
        {/* Sky */}
        <rect
          x={center.x - faceRadius}
          y={center.y - faceRadius}
          width={faceRadius * 2}
          height={faceRadius}
          fill={`url(#${skyGradId})`}
        />
        {/* Ground */}
        <rect
          x={center.x - faceRadius}
          y={center.y}
          width={faceRadius * 2}
          height={faceRadius}
          fill={`url(#${groundGradId})`}
        />
        {/* Horizon highlight bloom — straddles the sky/ground seam. */}
        <rect
          x={center.x - faceRadius}
          y={center.y - faceRadius * 0.06}
          width={faceRadius * 2}
          height={faceRadius * 0.12}
          fill={`url(#${horizonGradId})`}
        />

        {/* Pitch-ladder rungs — static reference lines etched on the glass. */}
        <g stroke="rgb(255 255 255 / 0.55)" pointerEvents="none">
          {PITCH_RUNGS.map(({ y, wFrac, major }) => (
            <line
              key={`pitch-${y}`}
              x1={center.x - faceRadius * wFrac}
              y1={center.y + faceRadius * y}
              x2={center.x + faceRadius * wFrac}
              y2={center.y + faceRadius * y}
              strokeWidth={major ? 1.5 : 1}
              opacity={major ? 0.75 : 0.45}
            />
          ))}
          {/* Centre datum — a slightly stronger horizon witness mark. */}
          <line
            x1={center.x - faceRadius * 0.62}
            y1={center.y}
            x2={center.x + faceRadius * 0.62}
            y2={center.y}
            strokeWidth={1.4}
            opacity={0.7}
          />
        </g>

        {/* Vignette — sits on top of the gradients so corners feel deeper. */}
        <rect
          x={center.x - faceRadius}
          y={center.y - faceRadius}
          width={faceRadius * 2}
          height={faceRadius * 2}
          fill={`url(#${vignetteId})`}
          pointerEvents="none"
        />
      </g>

      {/* Black frame around the WHOLE dial face. Top half is hidden under
          the bezel band; bottom half frames the dial without a visible gap
          between the window and the half-arc. Thicker than the bezel-band
          stroke for visual weight. */}
      <circle
        cx={center.x}
        cy={center.y}
        r={faceRadius + 2.5}
        fill="none"
        stroke="#15191d"
        strokeWidth={5}
        pointerEvents="none"
      />

      {/* Bezel — closed band with rounded corners (NOT round end-caps).
          Stroke 8 chamfers each corner by ~4 viewBox units; ends stay flat. */}
      <path
        d={bezelBandPath}
        fill="#15191d"
        stroke="#15191d"
        strokeWidth={8}
        strokeLinejoin="round"
        style={{ filter: "drop-shadow(0 4px 6px rgba(0,0,0,0.32))" }}
      />

      {/* Plane silhouette — banks around the dial centre to show the axis tilt.
          The clip lives on this STATIC parent (not on the rotating group): a
          transform on an ancestor breaks `userSpaceOnUse` clipping, so the
          plane must rotate INSIDE the clip. `transform-box: view-box` makes
          `transform-origin` resolve in viewBox units → pivot = dial centre. */}
      <g clipPath={`url(#${faceClipId})`}>
        <g
          style={{
            transform: `rotate(${tiltDeg}deg)`,
            transformBox: "view-box",
            transformOrigin: `${center.x}px ${center.y}px`,
            transition: reduceMotion ? undefined : TILT_TRANSITION,
          }}
        >
          <Plane
            x={center.x - PLANE_BOX / 2}
            y={center.y - PLANE_BOX / 2 + PLANE_Y_OFFSET}
            width={PLANE_BOX}
            height={PLANE_BOX}
            color="#ffffff"
          />
        </g>
      </g>

      {/* Current-level pointer — rides the bezel, banking in sync with the
          plane (same rotation/pivot, but NOT clipped so it stays on the rim).
          At ±1/±2/±3 it lands on the axis-arc markers (red X at ±3). */}
      <g
        style={{
          transform: `rotate(${tiltDeg}deg)`,
          transformBox: "view-box",
          transformOrigin: `${center.x}px ${center.y}px`,
          transition: reduceMotion ? undefined : TILT_TRANSITION,
        }}
      >
        <polygon
          points={`${center.x - 4},${center.y - faceRadius + 8} ${center.x + 4},${center.y - faceRadius + 8} ${center.x},${center.y - faceRadius - 3}`}
          fill="white"
          stroke="white"
          strokeWidth={1.8}
          strokeLinejoin="round"
          style={{ filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.5))" }}
          pointerEvents="none"
        />
      </g>
    </BoardLayer>
  );
}
