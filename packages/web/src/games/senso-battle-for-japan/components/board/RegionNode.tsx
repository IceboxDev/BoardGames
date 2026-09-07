import { REGIONS } from "@boardgames/core/games/senso-battle-for-japan/map";
import { regionLabel } from "@boardgames/core/games/senso-battle-for-japan/types";
import { roundedRect } from "../../../../components/board";
import {
  AFFECTED_FILL,
  AFFECTED_STROKE,
  MAP_INK,
  MAP_INK_FAINT,
  MAP_PAPER,
  MAP_PAPER_EDGE,
  MAP_SQUARE_FILL,
  MAP_SQUARE_STROKE,
} from "../../colors";
import { BADGE_RADIUS, NODE_RADIUS, type NodeLayout } from "./geometry";

interface Props {
  node: NodeLayout;
  affectedBy: string | null;
  empty: boolean[];
}

/** The paper card for one region: number badge, VP labels, empty squares, the Affected marker. */
export default function RegionNode({ node, affectedBy, empty }: Props) {
  const def = REGIONS[node.region];
  const label = regionLabel(node.region);
  const affected = affectedBy !== null;
  return (
    <g aria-hidden>
      <path
        d={roundedRect(node.bounds.x, node.bounds.y, node.bounds.w, node.bounds.h, NODE_RADIUS)}
        fill={MAP_PAPER}
        stroke={MAP_PAPER_EDGE}
        strokeWidth={2}
      />
      {node.squares.map((sq, i) => (
        <g key={sq.y * 1000 + sq.x}>
          <rect
            x={sq.x}
            y={sq.y}
            width={sq.w}
            height={sq.h}
            rx={5}
            fill={MAP_SQUARE_FILL}
            stroke={MAP_SQUARE_STROKE}
            strokeWidth={1.5}
          />
          {empty[i] && (
            <text
              x={sq.x + sq.w / 2}
              y={sq.y + sq.h / 2}
              fontSize={22}
              fontWeight={700}
              fill={MAP_INK_FAINT}
              textAnchor="middle"
              dominantBaseline="central"
              style={{ userSelect: "none" }}
            >
              {def.squares[i]}
            </text>
          )}
          <text
            x={node.vpLabels[i].x}
            y={node.vpLabels[i].y}
            fontSize={11}
            fontWeight={700}
            fill={MAP_INK}
            textAnchor="middle"
            dominantBaseline="central"
            style={{ userSelect: "none" }}
          >
            {def.squares[i]}
          </text>
        </g>
      ))}
      <circle
        cx={node.badge.x}
        cy={node.badge.y}
        r={BADGE_RADIUS}
        fill={affected ? AFFECTED_FILL : MAP_PAPER}
        stroke={affected ? AFFECTED_STROKE : MAP_INK}
        strokeWidth={affected ? 2 : 1.5}
      />
      <text
        x={node.badge.x}
        y={node.badge.y + 0.5}
        fontSize={13}
        fontWeight={800}
        fill={affected ? AFFECTED_STROKE : MAP_INK}
        textAnchor="middle"
        dominantBaseline="central"
        style={{ userSelect: "none" }}
      >
        {label}
      </text>
      {affected && (
        <g transform={`translate(${node.lock.x} ${node.lock.y})`}>
          <title>{`Region ${label} — affected by ${affectedBy} this phase`}</title>
          <rect
            x={-6}
            y={-6}
            width={12}
            height={12}
            rx={2}
            fill={AFFECTED_FILL}
            transform="rotate(45)"
          />
        </g>
      )}
    </g>
  );
}
