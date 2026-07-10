import type { CardColor, CardId } from "@boardgames/core/games/7-wonders/types";
import { CARD_COLORS, cardIdName } from "@boardgames/core/games/7-wonders/types";
import { COLOR_HEX, defOf } from "../card-utils";

interface TableauDisplayProps {
  tableau: CardId[];
  /** Compact chips for opponent panels; larger rows for the own-board area. */
  size?: "sm" | "md";
}

/** Played cards grouped by color as name chips with the color as accent. */
export default function TableauDisplay({ tableau, size = "md" }: TableauDisplayProps) {
  const byColor = new Map<CardColor, CardId[]>();
  for (const id of tableau) {
    const color = defOf(id).color;
    byColor.set(color, [...(byColor.get(color) ?? []), id]);
  }

  if (tableau.length === 0) {
    return <p className="text-xs italic text-fg-disabled">No cards built yet</p>;
  }

  const chipClass = size === "sm" ? "px-1 py-px text-4xs" : "px-1.5 py-0.5 text-2xs";

  return (
    <div className="flex flex-col gap-0.5">
      {CARD_COLORS.filter((color) => byColor.has(color)).map((color) => (
        <div key={color} className="flex flex-wrap items-center gap-0.5">
          {(byColor.get(color) ?? []).map((id) => (
            <span
              key={id}
              className={`${chipClass} rounded border bg-surface-800/80 leading-tight text-fg-primary`}
              style={{ borderColor: `${COLOR_HEX[color]}90` }}
              title={cardIdName(id)}
            >
              {cardIdName(id)}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
