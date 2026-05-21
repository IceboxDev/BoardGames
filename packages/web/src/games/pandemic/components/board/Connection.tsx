import { REFERENCE_WIDTH } from "./geometry";

interface Props {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** Connection wraps around the map's east/west edge (e.g. Tokyo ↔ SF). */
  loop: boolean;
  stroke: string;
  strokeWidth: number;
  opacity: number;
}

/**
 * One inter-city route. Renders either a single straight line between the
 * two city dots, or — for the four wrap-around routes that cross the
 * dateline — two segments that exit/enter the left and right map edges at
 * the linearly-interpolated y-position.
 *
 * Pure presentational SVG. No state, no event handlers — connections are
 * decorative; clicks happen on the city dots layer above.
 */
export default function Connection({ ax, ay, bx, by, loop, stroke, strokeWidth, opacity }: Props) {
  if (!loop) {
    return (
      <line
        x1={ax}
        y1={ay}
        x2={bx}
        y2={by}
        stroke={stroke}
        strokeWidth={strokeWidth}
        opacity={opacity}
        strokeLinecap="round"
      />
    );
  }

  // Wrap-around: the "short" path exits the left map edge from the
  // left-positioned city, re-enters from the right map edge to the
  // right-positioned city. Y at the edge crossing is linearly
  // interpolated by distance along the wrap.
  const isALeft = ax <= bx;
  const lx = isALeft ? ax : bx;
  const ly = isALeft ? ay : by;
  const rx = isALeft ? bx : ax;
  const ry = isALeft ? by : ay;

  const wrapDist = REFERENCE_WIDTH - rx + lx;
  const fracRight = wrapDist === 0 ? 0.5 : (REFERENCE_WIDTH - rx) / wrapDist;
  const edgeY = ry + (ly - ry) * fracRight;

  return (
    <g opacity={opacity}>
      <line
        x1={rx}
        y1={ry}
        x2={REFERENCE_WIDTH}
        y2={edgeY}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <line
        x1={0}
        y1={edgeY}
        x2={lx}
        y2={ly}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </g>
  );
}
