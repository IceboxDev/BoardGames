import type { SetCardData } from "@boardgames/core/games/set/types";
import { useMemo } from "react";
import SetCard from "./SetCard";

interface CardGridProps {
  slots: (SetCardData | null)[];
  selected: Set<number>;
  onToggle: (id: number) => void;
  disabled: boolean;
  hintedCardId: number | null;
}

export default function CardGrid({
  slots,
  selected,
  onToggle,
  disabled,
  hintedCardId,
}: CardGridProps) {
  const rows = useMemo(() => Math.ceil(slots.length / 3), [slots.length]);

  return (
    <div
      className="grid grid-cols-3 gap-2 h-full w-full max-w-4xl mx-auto"
      style={{ gridTemplateRows: `repeat(${rows}, 1fr)` }}
    >
      {slots.map((slot, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
        <div key={idx} className="min-h-0">
          {slot ? (
            <SetCard
              key={slot.id}
              card={slot}
              selected={selected.has(slot.id)}
              onClick={() => onToggle(slot.id)}
              disabled={disabled}
              animate
              hinted={slot.id === hintedCardId}
            />
          ) : (
            <div className="h-full w-full rounded-xl border-2 border-dashed border-gray-700/30" />
          )}
        </div>
      ))}
    </div>
  );
}
