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
            compact ? "text-3xs" : "text-xs"
          } ${isActive ? "text-accent-400" : "text-fg-muted"}`}
        >
          {label}
        </span>
        <span className={`text-fg-disabled tabular-nums ${compact ? "text-[9px]" : "text-3xs"}`}>
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
          <span className={`text-fg-disabled italic ${compact ? "text-3xs py-1" : "text-xs py-2"}`}>
            Empty
          </span>
        )}
      </div>
    </div>
  );
}
