import type { Card } from "@boardgames/core/games/sushi-go/types";
import CardFace from "../CardFace";
import type { CardSize } from "../card-utils";
import GhostCard from "./GhostCard";
import StationShell from "./StationShell";

interface PuddingStationProps {
  count: number;
  currentRoundCards: Card[];
  compact?: boolean;
}

export default function PuddingStation({ count, currentRoundCards, compact }: PuddingStationProps) {
  const size: CardSize = compact ? "sm" : "tableau";
  const priorCount = count - currentRoundCards.length;

  return (
    <StationShell theme="pudding" emoji="🍮" label="Pudding" badge={`x${count}`} compact={compact}>
      <div className="flex items-end gap-1">
        {/* Prior rounds — show one representative card with count badge */}
        {priorCount > 0 && (
          <div className="relative">
            <CardFace type="pudding" size={size} />
            {priorCount > 1 && (
              <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-pink-500/80 text-[10px] font-bold text-white shadow">
                {priorCount}
              </span>
            )}
          </div>
        )}
        {/* Current round pudding cards */}
        {currentRoundCards.map((card, i) => (
          <div key={card.id} className={i > 0 || priorCount > 0 ? "-ml-2" : ""}>
            <CardFace type={card.type} size={size} />
          </div>
        ))}
        {count === 0 && <GhostCard theme="pudding" size={size} label="0" />}
      </div>
      {!compact && (
        <span className="mt-1 text-[9px] text-pink-400/40 italic">Scored at game end</span>
      )}
    </StationShell>
  );
}
