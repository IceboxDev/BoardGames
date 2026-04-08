import { sortHand } from "@boardgames/core/games/lost-cities/deck";
import type { Card as CardData } from "@boardgames/core/games/lost-cities/types";
import { useMemo } from "react";
import Card from "./Card";

export interface FlatPlayerHandProps {
  cards: CardData[];
  label: string;
  highlightCardId?: number;
  isActive?: boolean;
  /** Tighter spacing for replay viewport fit (no internal scroll). */
  compact?: boolean;
}

/** Same card art as live play, laid out in a simple row (no fan). */
export default function FlatPlayerHand({
  cards,
  label,
  highlightCardId,
  isActive = false,
  compact = false,
}: FlatPlayerHandProps) {
  const sorted = useMemo(() => sortHand(cards), [cards]);

  return (
    <div className={`flex flex-col shrink-0 w-full ${compact ? "gap-0.5" : "gap-1.5"}`}>
      <div className={`flex items-center gap-1.5 px-0.5 ${compact ? "min-h-0" : ""}`}>
        <span
          className={`font-semibold uppercase tracking-wider ${
            compact ? "text-[10px]" : "text-xs"
          } ${isActive ? "text-indigo-400" : "text-gray-500"}`}
        >
          {label}
        </span>
        <span className={`text-gray-600 tabular-nums ${compact ? "text-[9px]" : "text-[10px]"}`}>
          {cards.length}
        </span>
      </div>
      <div className={`flex flex-wrap justify-center ${compact ? "gap-0.5" : "gap-1"}`}>
        {sorted.map((card) => (
          <div key={card.id} className={`shrink-0 ${compact ? "w-10" : "w-12"}`}>
            <Card card={card} size="sm" disabled glowing={card.id === highlightCardId} />
          </div>
        ))}
        {sorted.length === 0 && (
          <span className={`text-gray-600 italic ${compact ? "text-[10px] py-1" : "text-xs py-2"}`}>
            Empty
          </span>
        )}
      </div>
    </div>
  );
}
