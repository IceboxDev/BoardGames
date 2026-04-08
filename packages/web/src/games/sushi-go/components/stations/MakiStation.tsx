import type { Card } from "@boardgames/core/games/sushi-go/types";
import CardFace from "../CardFace";
import type { CardSize } from "../card-utils";
import StationShell from "./StationShell";

interface MakiStationProps {
  cards: Card[];
  totalPips: number;
  compact?: boolean;
}

export default function MakiStation({ cards, totalPips, compact }: MakiStationProps) {
  const size: CardSize = compact ? "sm" : "tableau";
  return (
    <StationShell
      theme="maki"
      emoji="🍣"
      label="Maki"
      badge={`${totalPips} rolls`}
      compact={compact}
    >
      <div className="flex items-end">
        {cards.map((card, i) => (
          <div key={card.id} className={i > 0 ? "-ml-2" : ""}>
            <CardFace type={card.type} size={size} />
          </div>
        ))}
      </div>
    </StationShell>
  );
}
