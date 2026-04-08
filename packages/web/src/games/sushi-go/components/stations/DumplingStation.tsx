import type { Card } from "@boardgames/core/games/sushi-go/types";
import { DUMPLING_SCORES } from "@boardgames/core/games/sushi-go/types";
import CardFace from "../CardFace";
import type { CardSize } from "../card-utils";
import StationShell from "./StationShell";

interface DumplingStationProps {
  cards: Card[];
  points: number;
  compact?: boolean;
}

const SCORE_STEPS = DUMPLING_SCORES.slice(1); // [1, 3, 6, 10, 15]

export default function DumplingStation({ cards, points, compact }: DumplingStationProps) {
  const size: CardSize = compact ? "sm" : "tableau";
  const count = cards.length;

  return (
    <StationShell
      theme="dumpling"
      emoji="🥟"
      label="Dumplings"
      badge={`${points} pts`}
      badgeDimmed={points === 0}
      compact={compact}
    >
      {/* Stacked cards with rising effect */}
      <div className="flex items-end">
        {cards.map((card, i) => (
          <div
            key={card.id}
            className={i > 0 ? "-ml-5" : ""}
            style={{ transform: `translateY(-${i * 2}px)`, zIndex: i }}
          >
            <CardFace type={card.type} size={size} />
          </div>
        ))}
      </div>

      {/* Score progression */}
      {!compact && (
        <div className="mt-2 flex items-center gap-1">
          {SCORE_STEPS.map((score, i) => {
            const stepNum = i + 1;
            const isActive = stepNum === count;
            const isPast = stepNum < count;
            return (
              <span key={score} className="flex items-center gap-1">
                {i > 0 && <span className="text-[8px] text-gray-600">&middot;</span>}
                <span
                  className={`text-[10px] tabular-nums transition-all ${
                    isActive
                      ? "font-bold text-yellow-300"
                      : isPast
                        ? "text-yellow-500/50"
                        : "text-gray-600"
                  }`}
                >
                  {score}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </StationShell>
  );
}
