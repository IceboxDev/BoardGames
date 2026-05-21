import type { BoardRect } from "./types";

interface Props {
  bounds: BoardRect;
  radius?: number;
  inset?: number;
}

/**
 * A focus / selection ring sized to a slot's bounding rect. Painted by the
 * parent <BoardSlot> only when focused or selected. `pointer-events: none` so
 * it never steals the click.
 */
export default function BoardFocusRing({ bounds, radius = 6, inset = -3 }: Props) {
  return (
    <rect
      x={bounds.x + inset}
      y={bounds.y + inset}
      width={bounds.w - inset * 2}
      height={bounds.h - inset * 2}
      rx={radius}
      ry={radius}
      fill="none"
      stroke="rgb(250 204 21)"
      strokeWidth={3}
      pointerEvents="none"
    />
  );
}
