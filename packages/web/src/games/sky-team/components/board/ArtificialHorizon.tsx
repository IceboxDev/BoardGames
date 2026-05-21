import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { useId } from "react";
import { BoardLayer } from "../../../../components/board";
import { ARTIFICIAL_HORIZON } from "./geometry";

interface Props {
  view: SkyTeamPlayerView;
}

/**
 * The artificial-horizon dial. Rolls proportionally to `view.axis.position`
 * relative to `view.axis.spinAt` (the spin threshold).
 *
 * The dial face is masked to a circle; inside we draw a sky/ground/dirt
 * gradient and a plane silhouette. The whole inner group rotates with the
 * axis offset so the horizon line tilts the way the cockpit is leaning.
 */
export default function ArtificialHorizon({ view }: Props) {
  const { center, radius, bezelWidth } = ARTIFICIAL_HORIZON;
  const inner = radius - bezelWidth;
  const tiltDeg = (view.axis.position / view.axis.spinAt) * 35; // ±35° at the spin threshold

  const maskId = useId();
  const skyId = useId();

  return (
    <BoardLayer name="artificial-horizon" z={2}>
      <defs>
        <clipPath id={maskId}>
          <circle cx={center.x} cy={center.y} r={inner} />
        </clipPath>
        <linearGradient id={skyId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#24b7e7" />
          <stop offset="48%" stopColor="#24b7e7" />
          <stop offset="48%" stopColor="#f3eee1" />
          <stop offset="52%" stopColor="#f3eee1" />
          <stop offset="52%" stopColor="#8b633e" />
          <stop offset="100%" stopColor="#6a4830" />
        </linearGradient>
      </defs>

      {/* Outer bezel ring */}
      <circle
        cx={center.x}
        cy={center.y}
        r={radius}
        fill="#15191d"
        stroke="#485151"
        strokeWidth={2}
      />

      {/* Tick marks around the bezel — every 30° */}
      {Array.from({ length: 12 }, (_, i) => {
        const deg = i * 30;
        const angle = (deg * Math.PI) / 180 - Math.PI / 2;
        const x1 = center.x + Math.cos(angle) * (radius - 4);
        const y1 = center.y + Math.sin(angle) * (radius - 4);
        const x2 = center.x + Math.cos(angle) * (radius - bezelWidth + 2);
        const y2 = center.y + Math.sin(angle) * (radius - bezelWidth + 2);
        return (
          <line
            key={`tick-${deg}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="white"
            strokeWidth={1.5}
          />
        );
      })}

      {/* Horizon disc — rotates with axis tilt */}
      <g
        clipPath={`url(#${maskId})`}
        style={{
          transform: `rotate(${tiltDeg}deg)`,
          transformOrigin: `${center.x}px ${center.y}px`,
          transition: "transform 240ms cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        <rect
          x={center.x - radius - 40}
          y={center.y - radius - 40}
          width={radius * 2 + 80}
          height={radius * 2 + 80}
          fill={`url(#${skyId})`}
        />
        {/* Pitch ladder rungs (sky side) */}
        {[-2, -1, 1, 2].map((step) => {
          const y = center.y - step * (inner * 0.18);
          const halfWidth = step % 2 === 0 ? inner * 0.45 : inner * 0.3;
          return (
            <line
              key={`pitch-${step}`}
              x1={center.x - halfWidth}
              y1={y}
              x2={center.x + halfWidth}
              y2={y}
              stroke={step < 0 ? "rgb(255 255 255 / 0.5)" : "rgb(255 255 255 / 0.6)"}
              strokeWidth={1.5}
            />
          );
        })}
      </g>

      {/* Plane silhouette — fixed, doesn't rotate */}
      <g pointerEvents="none">
        <rect
          x={center.x - inner * 0.42}
          y={center.y - 3}
          width={inner * 0.84}
          height={6}
          fill="white"
        />
        <polygon
          points={`${center.x - 12},${center.y + 4} ${center.x + 12},${center.y + 4} ${center.x},${center.y + 28}`}
          fill="white"
        />
        <circle cx={center.x} cy={center.y} r={4} fill="#fde047" stroke="#15191d" strokeWidth={1} />
      </g>

      {/* Top index triangle (current heading marker) */}
      <polygon
        points={`${center.x - 8},${center.y - inner - 2} ${center.x + 8},${center.y - inner - 2} ${center.x},${center.y - inner + 10}`}
        fill="white"
        pointerEvents="none"
      />
    </BoardLayer>
  );
}
