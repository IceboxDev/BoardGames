import { scoreExpedition } from "../logic/scoring";
import type { Card as CardData, ExpeditionColor } from "../logic/types";
import { COLOR_HEX, COLOR_LABELS } from "../logic/types";
import Card, { CardPlaceholder } from "./Card";

interface ExpeditionColumnProps {
  color: ExpeditionColor;
  cards: CardData[];
  isPlayer: boolean;
  onClick?: (card: CardData) => void;
  glowing?: boolean;
}

export default function ExpeditionColumn({
  color,
  cards,
  isPlayer,
  onClick,
  glowing = false,
}: ExpeditionColumnProps) {
  const hex = COLOR_HEX[color];
  const score = scoreExpedition(color, cards);
  const displayCards = isPlayer ? cards : [...cards].reverse();

  return (
    <div className="flex flex-col items-center gap-1 min-w-14">
      {!isPlayer && (
        <span
          className="text-[0.6rem] font-bold tabular-nums"
          style={{ color: score.started ? hex : "rgb(107 114 128)" }}
        >
          {score.started ? score.total : "—"}
        </span>
      )}

      <div
        className={["relative flex flex-col items-center", isPlayer ? "" : "flex-col-reverse"].join(
          " ",
        )}
        style={{ minHeight: "4.5rem" }}
      >
        {cards.length === 0 ? (
          <CardPlaceholder
            color={color}
            size="sm"
            label={COLOR_LABELS[color][0]}
            glowing={glowing}
          />
        ) : (
          displayCards.map((card, i) => (
            <div
              key={card.id}
              className="transition-all duration-200"
              style={{
                marginTop: i === 0 ? 0 : isPlayer ? -52 : undefined,
                marginBottom: i === 0 ? 0 : !isPlayer ? -52 : undefined,
                zIndex: isPlayer ? i : displayCards.length - i,
              }}
            >
              <Card
                card={card}
                size="sm"
                onClick={onClick ? () => onClick(card) : undefined}
                disabled={!onClick}
              />
            </div>
          ))
        )}
      </div>

      {isPlayer && (
        <span
          className="text-[0.6rem] font-bold tabular-nums"
          style={{ color: score.started ? hex : "rgb(107 114 128)" }}
        >
          {score.started ? score.total : "—"}
        </span>
      )}
    </div>
  );
}
