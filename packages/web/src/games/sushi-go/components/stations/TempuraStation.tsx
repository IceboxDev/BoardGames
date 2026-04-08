import type { Card } from "@boardgames/core/games/sushi-go/types";
import CardFace from "../CardFace";
import type { CardSize } from "../card-utils";
import GhostCard from "./GhostCard";
import StationShell from "./StationShell";

interface TempuraStationProps {
  completePairs: [Card, Card][];
  remainder: Card[];
  points: number;
  compact?: boolean;
}

export default function TempuraStation({
  completePairs,
  remainder,
  points,
  compact,
}: TempuraStationProps) {
  const size: CardSize = compact ? "sm" : "tableau";
  return (
    <StationShell
      theme="tempura"
      emoji="🍤"
      label="Tempura"
      badge={`${points} pts`}
      badgeDimmed={points === 0}
      compact={compact}
    >
      <div className="flex flex-wrap items-end gap-3">
        {/* Complete pairs */}
        {completePairs.map(([a, b]) => (
          <div key={a.id} className="flex flex-col items-center">
            <div className="flex items-end -space-x-3">
              <div className="-rotate-5">
                <CardFace type={a.type} size={size} />
              </div>
              <div className="rotate-5">
                <CardFace type={b.type} size={size} />
              </div>
            </div>
            <span className="mt-1 rounded-full bg-amber-500/20 px-1.5 text-[10px] font-semibold text-amber-300">
              5 pts
            </span>
          </div>
        ))}

        {/* Remainder (0 or 1 card + ghost) */}
        {remainder.length > 0 && (
          <div className="flex flex-col items-center">
            <div className="flex items-end -space-x-3">
              <div className="-rotate-5">
                <CardFace type={remainder[0].type} size={size} />
              </div>
              <div className="rotate-5">
                <GhostCard theme="tempura" size={size} />
              </div>
            </div>
            <span className="mt-1 text-[10px] text-amber-400/50 italic">Need 1 more</span>
          </div>
        )}
      </div>
    </StationShell>
  );
}
