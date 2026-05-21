import { type KeyboardEvent, type ReactNode, useState } from "react";
import BoardFocusRing from "./BoardFocusRing";
import type { BoardRect, BoardSlotVariant } from "./types";
import { useBoardCoords } from "./use-board-coords";

interface Props {
  bounds: BoardRect;
  /** Pointer/keyboard activation. Fires once for Enter, Space, or click. */
  onSelect?: () => void;
  /** Highlight as a legal target (pulsing ring). */
  selectable?: boolean;
  /** Persistent selected state (e.g. die is here). */
  selected?: boolean;
  disabled?: boolean;
  variant?: BoardSlotVariant;
  "aria-label"?: string;
  /** Round corners on the underlying rect (viewBox units). */
  radius?: number;
  children?: ReactNode;
}

const VARIANT_STROKE: Record<BoardSlotVariant, string> = {
  pilot: "rgb(56 189 248 / 0.55)",
  copilot: "rgb(249 115 22 / 0.6)",
  neutral: "rgb(71 85 105 / 0.7)",
  mixed: "rgb(148 163 184 / 0.6)",
  system: "rgb(71 85 105 / 0.7)",
};

/**
 * Interactive group with a tappable rect, focus/selection ring, and arbitrary
 * SVG children (labels, indicators). One <BoardSlot> per logical interactive
 * region on the board.
 *
 * Variant fills come from per-surface gradient IDs registered by
 * <BoardSurface> and exposed via <BoardCoordsContext>.
 */
export default function BoardSlot({
  bounds,
  onSelect,
  selectable,
  selected,
  disabled,
  variant = "neutral",
  "aria-label": ariaLabel,
  radius = 9,
  children,
}: Props) {
  const { slotFillIds } = useBoardCoords();
  const [focused, setFocused] = useState(false);

  const handleKey = (e: KeyboardEvent<SVGGElement>) => {
    if (disabled || !onSelect) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  };

  const interactive = !disabled && !!onSelect;
  const showRing = focused || selected;

  const fill =
    variant === "pilot"
      ? `url(#${slotFillIds.pilot})`
      : variant === "copilot"
        ? `url(#${slotFillIds.copilot})`
        : variant === "mixed"
          ? `url(#${slotFillIds.mixed})`
          : variant === "system"
            ? "rgb(2 6 23 / 0.85)"
            : "rgb(15 23 42 / 0.7)";

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: <g role="button" tabIndex> is the standard ARIA pattern for interactive SVG regions; an HTML <button> can't host SVG children.
    <g
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      onClick={interactive ? onSelect : undefined}
      onKeyDown={interactive ? handleKey : undefined}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{ cursor: interactive ? "pointer" : "default", outline: "none" }}
    >
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.w}
        height={bounds.h}
        rx={radius}
        ry={radius}
        fill={fill}
        stroke={VARIANT_STROKE[variant]}
        strokeWidth={2}
      />
      {selectable && !selected ? (
        <rect
          x={bounds.x - 2}
          y={bounds.y - 2}
          width={bounds.w + 4}
          height={bounds.h + 4}
          rx={radius + 2}
          ry={radius + 2}
          fill="none"
          stroke="rgb(250 204 21)"
          strokeWidth={2}
          strokeDasharray="6 4"
          pointerEvents="none"
        >
          <animate
            attributeName="stroke-opacity"
            values="0.4;1;0.4"
            dur="1.4s"
            repeatCount="indefinite"
          />
        </rect>
      ) : null}
      {showRing ? <BoardFocusRing bounds={bounds} radius={radius + 2} /> : null}
      {children}
    </g>
  );
}
