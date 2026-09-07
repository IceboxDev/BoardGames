import { CLAN_SHORT } from "@boardgames/core/games/senso-battle-for-japan/types";
import { useReducedMotion } from "framer-motion";
import { CLAN_FILL, CLAN_INK, CLAN_STROKE } from "../../colors";
import type { CubeMap, CubePosition } from "../../logic/cube-identity";
import { CUBE, CUBE_RADIUS, cubeCenter, type MapLayout } from "./geometry";

interface Props {
  cubes: CubeMap;
  layout: MapLayout;
  /** A translucent preview of where a placement would land. */
  ghost?: CubePosition | null;
}

/** Matches the board-primitive spring in feel; CSS so it works on SVG groups. */
const GLIDE = "transform 0.45s cubic-bezier(0.2, 0.8, 0.2, 1)";

function CubeFace({ clan, ghost = false }: { clan: CubePosition["clan"]; ghost?: boolean }) {
  return (
    <>
      <rect
        x={-CUBE / 2}
        y={-CUBE / 2}
        width={CUBE}
        height={CUBE}
        rx={CUBE_RADIUS}
        fill={CLAN_FILL[clan]}
        stroke={CLAN_STROKE[clan]}
        strokeWidth={2}
        strokeDasharray={ghost ? "4 3" : undefined}
        opacity={ghost ? 0.45 : 1}
      />
      <text
        x={0}
        y={1}
        fontSize={17}
        fontWeight={700}
        fill={CLAN_INK[clan]}
        textAnchor="middle"
        dominantBaseline="central"
        opacity={ghost ? 0.6 : 1}
        style={{ userSelect: "none" }}
      >
        {CLAN_SHORT[clan]}
      </text>
    </>
  );
}

/**
 * Cubes are positioned with a CSS transform on a plain <g> and keyed by a
 * reconciled identity, so a cube that moves between regions glides instead
 * of remounting. A CSS transition rather than framer-motion's `animate`:
 * `motion.g animate={{ x, y }}` only ever painted its first position here
 * (the same reason Sky Team's AltitudeWindow drives its tape with
 * `style.transform`). CSS px on an SVG element are viewBox user units.
 * Decorative: hit-testing lives on <MapTarget>.
 */
export default function CubeLayer({ cubes, layout, ghost }: Props) {
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion ? undefined : GLIDE;
  return (
    <g aria-hidden style={{ pointerEvents: "none" }}>
      {[...cubes].map(([id, cube]) => {
        const at = cubeCenter(layout, cube.region, cube.square);
        return (
          <g key={id} style={{ transform: `translate(${at.x}px, ${at.y}px)`, transition }}>
            <CubeFace clan={cube.clan} />
          </g>
        );
      })}
      {ghost && (
        <g
          style={{
            transform: `translate(${cubeCenter(layout, ghost.region, ghost.square).x}px, ${cubeCenter(layout, ghost.region, ghost.square).y}px)`,
          }}
        >
          <CubeFace clan={ghost.clan} ghost />
        </g>
      )}
    </g>
  );
}
