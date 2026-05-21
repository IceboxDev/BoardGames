import type { Die, DieValue } from "@boardgames/core/games/sky-team/types";

interface Props {
  die: Die | { color: "blue" | "orange"; value: DieValue };
  /** Centre coordinate (viewBox units). */
  cx: number;
  cy: number;
  /** Side length of the die square. */
  size?: number;
}

const FILL: Record<"blue" | "orange", string> = {
  blue: "#3a55d8",
  orange: "#ed7a23",
};

const STROKE: Record<"blue" | "orange", string> = {
  blue: "#bcd0ff",
  orange: "#ffd6a8",
};

/**
 * SVG die for use inside the cockpit (when a die is placed into a slot).
 * The HTML <Die> component is still used inside <PlayerDiceTray>, which is
 * HTML; this one is the SVG counterpart.
 */
export default function PlayerCockpitDie({ die, cx, cy, size = 44 }: Props) {
  const half = size / 2;
  return (
    <g pointerEvents="none">
      <rect
        x={cx - half}
        y={cy - half}
        width={size}
        height={size}
        rx={8}
        ry={8}
        fill={FILL[die.color]}
        stroke={STROKE[die.color]}
        strokeWidth={2}
      />
      <text
        x={cx}
        y={cy}
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={size * 0.55}
        fontWeight={900}
        fill="white"
      >
        {die.value}
      </text>
    </g>
  );
}
