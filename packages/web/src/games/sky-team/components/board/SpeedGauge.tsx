import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { BoardLayer } from "../../../../components/board";
import { SPEED_GAUGE } from "./geometry";

interface Props {
  view: SkyTeamPlayerView;
}

const CELLS = 16;

/**
 * Speed-gauge ribbon: 16 cells running across the play area, with pilot
 * (blue) and copilot (orange) position markers. The "speed" used to evaluate
 * advance/collision is `pilotEngine + copilotEngine`, compared against these
 * positions.
 */
export default function SpeedGauge({ view }: Props) {
  const cellW = SPEED_GAUGE.w / CELLS;

  return (
    <BoardLayer name="speed-gauge" z={1} aria-label="Speed gauge">
      <rect
        x={SPEED_GAUGE.x}
        y={SPEED_GAUGE.y}
        width={SPEED_GAUGE.w}
        height={SPEED_GAUGE.h}
        rx={5}
        ry={5}
        fill="rgb(2 6 23 / 0.55)"
        stroke="rgb(71 85 105 / 0.6)"
        strokeWidth={1.5}
      />
      {Array.from({ length: CELLS }, (_, i) => {
        const v = i + 1;
        const blueAt = v === view.speedGauge.bluePos + 1;
        const orangeAt = v === view.speedGauge.orangePos + 1;
        const x = SPEED_GAUGE.x + i * cellW;
        const fill = blueAt
          ? "rgb(56 189 248 / 0.8)"
          : orangeAt
            ? "rgb(249 115 22 / 0.85)"
            : "transparent";
        const textColor = blueAt || orangeAt ? "white" : "rgb(100 116 139)";
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: speed cells are stable indexed positions
          <g key={`speed-${i}`}>
            <rect
              x={x + 1}
              y={SPEED_GAUGE.y + 1}
              width={cellW - 2}
              height={SPEED_GAUGE.h - 2}
              rx={3}
              ry={3}
              fill={fill}
            />
            <text
              x={x + cellW / 2}
              y={SPEED_GAUGE.y + SPEED_GAUGE.h / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={SPEED_GAUGE.h * 0.55}
              fontWeight={blueAt || orangeAt ? 800 : 500}
              fill={textColor}
            >
              {v}
            </text>
          </g>
        );
      })}
    </BoardLayer>
  );
}
