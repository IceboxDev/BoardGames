import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { BoardLayer } from "../../../../components/board";
import { APPROACH_RIBBON } from "./geometry";

interface Props {
  view: SkyTeamPlayerView;
}

/**
 * The approach corridor: a row of cells showing the airplane's progress
 * toward the airport, with airliner obstacles drawn as red plane glyphs and
 * the airport (YUL) at the right end.
 */
export default function ApproachRibbon({ view }: Props) {
  const { airliners, current, airportIndex } = view.approach;
  const total = airliners.length;
  const cellW = APPROACH_RIBBON.w / total;
  const cellH = APPROACH_RIBBON.h;

  return (
    <BoardLayer name="approach-ribbon" z={1} aria-label="Approach corridor">
      <rect
        x={APPROACH_RIBBON.x}
        y={APPROACH_RIBBON.y}
        width={APPROACH_RIBBON.w}
        height={APPROACH_RIBBON.h}
        rx={6}
        ry={6}
        fill="rgb(2 6 23 / 0.55)"
        stroke="rgb(71 85 105 / 0.6)"
        strokeWidth={1.5}
      />
      {airliners.map((count, i) => {
        const x = APPROACH_RIBBON.x + i * cellW;
        const isPlane = current === i;
        const isAirport = airportIndex === i;
        const cellFill = isAirport
          ? "rgb(6 78 59 / 0.7)"
          : isPlane
            ? "rgb(30 41 59 / 0.7)"
            : "rgb(15 23 42 / 0.45)";
        const cellStroke = isAirport
          ? "rgb(74 222 128)"
          : isPlane
            ? "rgb(253 224 71)"
            : "rgb(71 85 105 / 0.7)";
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: corridor positions are stable indexed slots
          <g key={`approach-${i}`}>
            <rect
              x={x + 1}
              y={APPROACH_RIBBON.y + 1}
              width={cellW - 2}
              height={cellH - 2}
              rx={4}
              ry={4}
              fill={cellFill}
              stroke={cellStroke}
              strokeWidth={1.5}
            />
            {isPlane ? (
              <text
                x={x + cellW / 2}
                y={APPROACH_RIBBON.y + cellH / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={cellH * 0.55}
                fill="rgb(253 224 71)"
              >
                ✈
              </text>
            ) : count > 0 ? (
              <text
                x={x + cellW / 2}
                y={APPROACH_RIBBON.y + cellH / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={cellH * 0.42}
                fill="rgb(248 113 113)"
                fontWeight={700}
              >
                ✈ ×{count}
              </text>
            ) : isAirport ? (
              <text
                x={x + cellW / 2}
                y={APPROACH_RIBBON.y + cellH / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={cellH * 0.42}
                fontWeight={800}
                fill="rgb(134 239 172)"
              >
                YUL
              </text>
            ) : null}
          </g>
        );
      })}
    </BoardLayer>
  );
}
