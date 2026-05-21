import type { CubeCounts, DiseaseColor } from "@boardgames/core/games/pandemic/types";
import { DISEASE_COLORS } from "@boardgames/core/games/pandemic/types";
import { DISEASE_FILL, DISEASE_STROKE } from "../../colors";
import { CUBE_GAP, CUBE_ROW_LIMIT, CUBE_SIZE } from "./geometry";

interface Props {
  /** Counts per color at this city. Cubes render in DISEASE_COLORS order. */
  cubes: CubeCounts;
}

/**
 * Stack of disease cubes for a single city. Cubes are drawn as small
 * rounded squares laid out in rows of `CUBE_ROW_LIMIT`; total count never
 * exceeds 9 (three colors × max-three-per-color), so two rows of four +
 * one fits without further wrapping logic.
 *
 * Rendered in city-local coordinates — the parent CityNode places this
 * group beneath the dot at `(−rowWidth/2, CUBE_STACK_OFFSET_Y)`.
 */
export default function DiseaseCubes({ cubes }: Props) {
  const items: { color: DiseaseColor; index: number }[] = [];
  for (const color of DISEASE_COLORS) {
    for (let i = 0; i < cubes[color]; i++) items.push({ color, index: items.length });
  }
  if (items.length === 0) return null;

  // Centered horizontally around x=0: a row of N cubes has total width
  // N*(SIZE + GAP) − GAP, so the leftmost cube starts at −(rowWidth / 2).
  const rowWidth = CUBE_ROW_LIMIT * (CUBE_SIZE + CUBE_GAP) - CUBE_GAP;
  const startX = -rowWidth / 2;

  // Parent CityNode owns the accessible label (city name + cube counts via
  // CityTooltip), so the cube stack itself doesn't need a separate label —
  // but it stays inside the focusable city <g>, so we leave it
  // semantically empty instead of hiding it. Cubes are pointer-passthrough
  // so the city's click target spans the whole region.
  return (
    <g style={{ pointerEvents: "none" }}>
      {items.map(({ color, index }) => {
        const col = index % CUBE_ROW_LIMIT;
        const row = Math.floor(index / CUBE_ROW_LIMIT);
        const x = startX + col * (CUBE_SIZE + CUBE_GAP);
        const y = row * (CUBE_SIZE + CUBE_GAP);
        return (
          <rect
            key={`${color}-${index}`}
            x={x}
            y={y}
            width={CUBE_SIZE}
            height={CUBE_SIZE}
            rx={2}
            fill={DISEASE_FILL[color]}
            stroke={DISEASE_STROKE[color]}
            strokeWidth={1}
          />
        );
      })}
    </g>
  );
}
