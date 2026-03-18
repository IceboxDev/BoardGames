import type { SetCardData } from "../logic/types";
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
  return (
    <div className="grid grid-cols-3 gap-3">
      {slots.map((slot, idx) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static list / chart data points don't reorder
        <div key={idx} className="aspect-[5/3]">
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
