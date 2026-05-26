import type { SkyTeamPlayerView } from "@boardgames/core/games/sky-team/types";
import { BoardLayer } from "../../../../components/board";
import { SPEED_GAUGE } from "./geometry";

interface Props {
  view: SkyTeamPlayerView;
}

const CELLS = 16;

/**
 * Speed-gauge ribbon: 16 cells running across the play area, with pilot
 * (blue) and copilot (orange) position markers shown as play/forward
 * triangles that sit on the threshold cell — i.e. the lowest speed that
 * actually advances. Placing a landing-gear die shifts the blue marker one
 * cell right; placing a flaps die shifts the orange marker. When both
 * engines have a die placed, the cell at `pilot+copilot` lights up to show
 * the resolved speed against the threshold markers.
 */
export default function SpeedGauge({ view }: Props) {
  const cellW = SPEED_GAUGE.w / CELLS;
  const pilotEngine = view.slots["pilot-engine"]?.die?.value ?? null;
  const copilotEngine = view.slots["copilot-engine"]?.die?.value ?? null;
  const engineSum =
    pilotEngine != null && copilotEngine != null ? pilotEngine + copilotEngine : null;

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
        const sumAt = engineSum != null && v === engineSum;
        const x = SPEED_GAUGE.x + i * cellW;
        const cellFill = blueAt
          ? "rgb(56 189 248 / 0.85)"
          : orangeAt
            ? "rgb(249 115 22 / 0.9)"
            : sumAt
              ? "rgb(250 204 21 / 0.4)"
              : "transparent";
        const textColor = blueAt || orangeAt ? "white" : sumAt ? "#fde047" : "rgb(100 116 139)";
        // Play / forward triangle: only on the blue + orange threshold cells.
        const playColor = blueAt ? "white" : orangeAt ? "white" : null;
        const triSize = SPEED_GAUGE.h * 0.32;
        const triX = x + cellW - triSize - 2;
        const triY = SPEED_GAUGE.y + (SPEED_GAUGE.h - triSize) / 2;
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
              fill={cellFill}
              stroke={sumAt && !blueAt && !orangeAt ? "#fde047" : "none"}
              strokeWidth={sumAt && !blueAt && !orangeAt ? 1.5 : 0}
            />
            <text
              x={x + cellW / 2}
              y={SPEED_GAUGE.y + SPEED_GAUGE.h / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={SPEED_GAUGE.h * 0.55}
              fontWeight={blueAt || orangeAt || sumAt ? 800 : 500}
              fill={textColor}
            >
              {v}
            </text>
            {playColor && (
              <polygon
                points={`${triX},${triY} ${triX + triSize},${triY + triSize / 2} ${triX},${triY + triSize}`}
                fill={playColor}
                opacity={0.95}
              />
            )}
          </g>
        );
      })}
    </BoardLayer>
  );
}
