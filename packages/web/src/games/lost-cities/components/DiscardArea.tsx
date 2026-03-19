import type { DiscardPiles, ExpeditionColor } from "@boardgames/core/games/lost-cities/types";
import { EXPEDITION_COLORS } from "@boardgames/core/games/lost-cities/types";
import DiscardPile from "./DiscardPile";

interface DiscardAreaProps {
  discardPiles: DiscardPiles;
  onPickDiscard?: (color: ExpeditionColor) => void;
  glowingColors?: Set<ExpeditionColor>;
}

export default function DiscardArea({
  discardPiles,
  onPickDiscard,
  glowingColors,
}: DiscardAreaProps) {
  return (
    <div className="flex gap-2 justify-center">
      {EXPEDITION_COLORS.map((color) => (
        <DiscardPile
          key={color}
          color={color}
          cards={discardPiles[color]}
          onClick={
            onPickDiscard && glowingColors?.has(color) ? () => onPickDiscard(color) : undefined
          }
          glowing={glowingColors?.has(color) ?? false}
        />
      ))}
    </div>
  );
}
