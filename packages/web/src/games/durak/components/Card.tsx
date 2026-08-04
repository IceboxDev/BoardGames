import type { Card as CardData, Suit } from "@boardgames/core/games/durak/types";
import { RANK_LABELS } from "@boardgames/core/games/durak/types";
import { cardChrome } from "../../../components/card-fan/card-chrome";
import { getCardSvg } from "../card-svg";

interface CardProps {
  card: CardData;
  trumpSuit?: Suit;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  glowing?: boolean;
  size?: "sm" | "md" | "lg" | "hand";
}

const SIZE_CLASSES = {
  sm: "h-20 w-14",
  md: "h-28 w-20",
  lg: "h-36 w-24",
  hand: "w-full aspect-[2/3]",
};

export default function Card({
  card,
  trumpSuit,
  onClick,
  disabled = false,
  selected = false,
  glowing = false,
  size = "md",
}: CardProps) {
  const sizeClass = SIZE_CLASSES[size];
  const isTrump = trumpSuit != null && card.suit === trumpSuit;
  const src = getCardSvg(card.rank, card.suit);

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cardChrome({
        size: sizeClass,
        selected,
        glowClass: glowing ? "ring-2 ring-emerald-400/80 shadow-lg shadow-emerald-500/30" : "",
        disabled,
        hover: onClick ? "lift" : "none",
        className: "bg-white px-[4%]",
      })}
    >
      <img
        src={src}
        alt={`${RANK_LABELS[card.rank]} of ${card.suit}`}
        className="h-full w-full object-fill"
        draggable={false}
      />

      {isTrump && (
        <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-5xs font-bold text-amber-900 shadow">
          T
        </div>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Face-down card
// ---------------------------------------------------------------------------

export function CardBack({ size = "md" }: { size?: "sm" | "md" | "lg" | "hand" }) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} flex items-center justify-center rounded-lg border border-gray-600 bg-gradient-to-br from-indigo-900 to-indigo-950 shadow-md`}
    >
      <div className="text-lg text-accent-400/50">&#x2660;</div>
    </div>
  );
}
