import type { KeyboardEvent, ReactNode } from "react";
import { useState } from "react";
import { BoardFocusRing, type BoardRect } from "../../../../components/board";
import { HIGHLIGHT, type HighlightKind } from "../../colors";
import { NODE_RADIUS } from "./geometry";

interface Props {
  id: string;
  bounds: BoardRect;
  label: string;
  kind: HighlightKind;
  selected?: boolean;
  onSelect: () => void;
  children?: ReactNode;
}

/**
 * A legal target on the map: a real focusable SVG group (Enter / Space / click
 * all collapse to `onSelect`) drawing its own highlight ring. Only rendered
 * for targets that are legal right now, so the accessibility tree lists
 * exactly the moves on offer.
 */
export default function MapTarget({
  id,
  bounds,
  label,
  kind,
  selected = false,
  onSelect,
  children,
}: Props) {
  const [focused, setFocused] = useState(false);
  const color = HIGHLIGHT[kind];

  function handleKey(e: KeyboardEvent<SVGGElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect();
    }
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: <g role="button"> is the standard ARIA pattern for an interactive SVG region — an HTML <button> can't host SVG children
    <g
      role="button"
      tabIndex={0}
      aria-label={label}
      data-slot-id={id}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onKeyDown={handleKey}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{ cursor: "pointer", outline: "none" }}
    >
      <rect
        x={bounds.x}
        y={bounds.y}
        width={bounds.w}
        height={bounds.h}
        rx={NODE_RADIUS}
        fill={color}
        fillOpacity={selected ? 0.35 : 0.16}
        stroke={color}
        strokeWidth={selected ? 3 : 2.5}
        strokeDasharray={kind === "source" && !selected ? "6 4" : undefined}
      />
      {children}
      {focused && <BoardFocusRing bounds={bounds} radius={NODE_RADIUS} />}
    </g>
  );
}
