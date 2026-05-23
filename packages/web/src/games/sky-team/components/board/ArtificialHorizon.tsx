import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { useId } from "react";
import { BoardLayer } from "../../../../components/board";
import { ARTIFICIAL_HORIZON } from "./geometry";
import Plane from "./Plane";

interface Props {
  view: SkyTeamPlayerView;
}

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
 * Artificial-horizon dial — background only. The dial face is now STATIC; the
 * symbolic plane that overlays it (next iteration) will be what rotates with
 * `view.axis.position`.
 *
 * Composition (back-to-front):
 *   1. Sky gradient (top half) + ground gradient (bottom half)
 *   2. Warm horizon highlight band straddling the meeting line
 *   3. Static pitch-ladder rungs etched on the "glass"
 *   4. Radial vignette darkening the edges for depth
 *   5. Black frame around the dial face
 *   6. Bezel band — top 170° only, leaving the lower face open for the speed arc
 *   7. Current-level pointer triangle (up-pointing, matching axis-arc style)
 *   8. Plane silhouette — untouched here; reworked next step
 */
export default function ArtificialHorizon(_props: Props) {
  const { center, outerRadius, faceRadius, bezelThickness } = ARTIFICIAL_HORIZON;

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
  // centred on the plane's centroid). 360×360 in board coords ≈ 271 plane
  // wide, filling most of the dial face (diameter 306). With the centroid-
  // centred viewBox the plane's visual weight lands at the SVG centre, so no
  // y-offset is needed — it sits on the horizon line at the dial centre.
  const PLANE_BOX = 360;
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
              // biome-ignore lint/suspicious/noArrayIndexKey: stable indexed pitch rungs
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

      {/* Current-level pointer — filled isoceles triangle matching the
          axis-arc spec EXACTLY (base 8, height 11, white fill, white stroke
          1.8, drop-shadow). Apex 3 above the dial-face top edge; base 8
          below it — on the dial circle, just barely peeking into the bezel.
          Same visual weight as axis-arc triangles. */}
      <polygon
        points={`${center.x - 4},${center.y - faceRadius + 8} ${center.x + 4},${center.y - faceRadius + 8} ${center.x},${center.y - faceRadius - 3}`}
        fill="white"
        stroke="white"
        strokeWidth={1.8}
        strokeLinejoin="round"
        style={{ filter: "drop-shadow(0 1px 1.5px rgba(0,0,0,0.5))" }}
        pointerEvents="none"
      />

      {/* Plane silhouette — pure white via Plane's feColorMatrix recolour.
          Shifted UP by 30 from the dial centre so its visual weight lands
          where the old silhouette did, rather than sagging below centre. */}
      <Plane
        x={center.x - PLANE_BOX / 2}
        y={center.y - PLANE_BOX / 2 + PLANE_Y_OFFSET}
        width={PLANE_BOX}
        height={PLANE_BOX}
        color="#ffffff"
      />
    </BoardLayer>
  );
}
