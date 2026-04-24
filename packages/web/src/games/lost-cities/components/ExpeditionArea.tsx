import type { Card as CardData, Expeditions } from "@boardgames/core/games/lost-cities/types";
import { EXPEDITION_COLORS } from "@boardgames/core/games/lost-cities/types";
import ExpeditionColumn from "./ExpeditionColumn";

interface ExpeditionAreaProps {
  expeditions: Expeditions;
  isPlayer: boolean;
  onClick?: (card: CardData) => void;
}

export default function ExpeditionArea({ expeditions, isPlayer, onClick }: ExpeditionAreaProps) {
  return (
    <div className="flex flex-col items-center shrink-0 min-h-0">
      <div className="flex gap-2 justify-center">
        {EXPEDITION_COLORS.map((color) => (
          <ExpeditionColumn
            key={color}
            color={color}
            cards={expeditions[color]}
            isPlayer={isPlayer}
            onClick={onClick}
          />
        ))}
      </div>
    </div>
  );
}
