import { useId } from "react";
import { BoardLayer } from "../../../../components/board";
import { COCKPIT_VIEWBOX, PLAY_AREA, SIDE_STRIP_WIDTH } from "./geometry";

/**
 * Static cockpit chrome: panel gradient, central seam, "U" play-area outline,
 * side-strip dividers. Purely decorative, aria-hidden.
 */
export default function CockpitBackground() {
  const panelId = useId();
  return (
    <BoardLayer name="cockpit-background" z={0} aria-hidden>
      <defs>
        <linearGradient id={panelId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#c0d1cf" />
          <stop offset="55%" stopColor="#a7bbbb" />
          <stop offset="100%" stopColor="#c7d5d1" />
        </linearGradient>
      </defs>
      <rect
        x={COCKPIT_VIEWBOX.x}
        y={COCKPIT_VIEWBOX.y}
        width={COCKPIT_VIEWBOX.width}
        height={COCKPIT_VIEWBOX.height}
        fill={`url(#${panelId})`}
      />

      <line
        x1={COCKPIT_VIEWBOX.width / 2}
        y1={0}
        x2={COCKPIT_VIEWBOX.width / 2}
        y2={COCKPIT_VIEWBOX.height}
        stroke="rgb(255 255 255 / 0.32)"
        strokeWidth={2}
      />

      <line
        x1={SIDE_STRIP_WIDTH}
        y1={0}
        x2={SIDE_STRIP_WIDTH}
        y2={COCKPIT_VIEWBOX.height}
        stroke="rgb(57 70 69 / 0.18)"
        strokeWidth={1.5}
      />
      <line
        x1={COCKPIT_VIEWBOX.width - SIDE_STRIP_WIDTH}
        y1={0}
        x2={COCKPIT_VIEWBOX.width - SIDE_STRIP_WIDTH}
        y2={COCKPIT_VIEWBOX.height}
        stroke="rgb(57 70 69 / 0.18)"
        strokeWidth={1.5}
      />

      <path
        d={
          `M ${PLAY_AREA.x} ${PLAY_AREA.y}` +
          ` H ${PLAY_AREA.x + PLAY_AREA.w}` +
          ` V ${PLAY_AREA.y + PLAY_AREA.h - 100}` +
          ` Q ${PLAY_AREA.x + PLAY_AREA.w} ${PLAY_AREA.y + PLAY_AREA.h} ${PLAY_AREA.x + PLAY_AREA.w - 100} ${PLAY_AREA.y + PLAY_AREA.h}` +
          ` H ${PLAY_AREA.x + 100}` +
          ` Q ${PLAY_AREA.x} ${PLAY_AREA.y + PLAY_AREA.h} ${PLAY_AREA.x} ${PLAY_AREA.y + PLAY_AREA.h - 100}` +
          ` Z`
        }
        fill="none"
        stroke="rgb(57 70 69 / 0.28)"
        strokeWidth={3}
      />
    </BoardLayer>
  );
}
