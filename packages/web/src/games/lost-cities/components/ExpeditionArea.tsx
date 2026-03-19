import { scorePlayer } from "@boardgames/core/games/lost-cities/scoring";
import type { Card as CardData, Expeditions } from "@boardgames/core/games/lost-cities/types";
import { EXPEDITION_COLORS } from "@boardgames/core/games/lost-cities/types";
import ExpeditionColumn from "./ExpeditionColumn";

interface ExpeditionAreaProps {
  expeditions: Expeditions;
  isPlayer: boolean;
  label: string;
  onClick?: (card: CardData) => void;
}

export default function ExpeditionArea({
  expeditions,
  isPlayer,
  label,
  onClick,
}: ExpeditionAreaProps) {
  const score = scorePlayer(expeditions);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex items-center gap-2 w-full px-2">
        <span className="text-xs font-semibold text-gray-400">{label}</span>
        <span className="text-xs font-bold text-white ml-auto tabular-nums">{score.total}</span>
      </div>
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
