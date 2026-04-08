import type { Card } from "@boardgames/core/games/sushi-go/types";
import CardFace from "../CardFace";
import type { CardSize } from "../card-utils";
import GhostCard from "./GhostCard";
import StationShell from "./StationShell";

interface SashimiStationProps {
  completeTriples: [Card, Card, Card][];
  remainder: Card[];
  points: number;
  compact?: boolean;
}

export default function SashimiStation({
  completeTriples,
  remainder,
  points,
  compact,
}: SashimiStationProps) {
  const size: CardSize = compact ? "sm" : "tableau";
  const rotations = ["-rotate-6", "rotate-0", "rotate-6"];

  return (
    <StationShell
      theme="sashimi"
      emoji="🐟"
      label="Sashimi"
      badge={`${points} pts`}
      badgeDimmed={points === 0}
      compact={compact}
    >
      <div className="flex flex-wrap items-end gap-3">
        {/* Complete triples */}
        {completeTriples.map(([a, b, c]) => (
          <div key={a.id} className="flex flex-col items-center">
            <div className="flex items-end -space-x-2">
              {[a, b, c].map((card, i) => (
                <div key={card.id} className={rotations[i]}>
                  <CardFace type={card.type} size={size} />
                </div>
              ))}
            </div>
            <span className="mt-1 rounded-full bg-emerald-500/20 px-1.5 text-[10px] font-semibold text-emerald-300">
              10 pts
            </span>
          </div>
        ))}

        {/* Remainder + ghosts */}
        {remainder.length > 0 && (
          <div className="flex flex-col items-center">
            <div className="flex items-end -space-x-2">
              {remainder.map((card, i) => (
                <div key={card.id} className={rotations[i]}>
                  <CardFace type={card.type} size={size} />
                </div>
              ))}
              {Array.from({ length: 3 - remainder.length }).map((_, i) => {
                const slot = remainder.length + i;
                return (
                  <div key={`ghost-slot-${slot}`} className={rotations[slot]}>
                    <GhostCard theme="sashimi" size={size} />
                  </div>
                );
              })}
            </div>
            <span className="mt-1 text-[10px] text-emerald-400/50 italic">
              Need {3 - remainder.length} more
            </span>
          </div>
        )}
      </div>
    </StationShell>
  );
}
