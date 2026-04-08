import type { Card as CardData, Rank, Suit } from "@boardgames/core/games/durak/types";
import { RANK_LABELS } from "@boardgames/core/games/durak/types";

const svgModules = import.meta.glob<string>("../../../assets/playing-cards/*.svg", {
  eager: true,
  import: "default",
});

const RANK_FILE_NAMES: Record<Rank, string> = {
  6: "6",
  7: "7",
  8: "8",
  9: "9",
  10: "10",
  11: "jack",
  12: "queen",
  13: "king",
  14: "ace",
};

function getCardSvg(rank: Rank, suit: Suit): string {
  const key = `../../../assets/playing-cards/${RANK_FILE_NAMES[rank]}_of_${suit}.svg`;
  return svgModules[key] ?? "";
}

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

  const ringClass = selected
    ? "ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-105"
    : glowing
      ? "ring-2 ring-emerald-400/80 shadow-lg shadow-emerald-500/30"
      : "";

  const interactionClass = disabled
    ? "opacity-40 cursor-not-allowed"
    : onClick
      ? "hover:shadow-xl hover:-translate-y-1 cursor-pointer"
      : "";

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`${sizeClass} relative overflow-hidden rounded-lg bg-white px-[4%] shadow-md transition-all ${ringClass} ${interactionClass}`}
    >
      <img
        src={src}
        alt={`${RANK_LABELS[card.rank]} of ${card.suit}`}
        className="h-full w-full object-fill"
        draggable={false}
      />

      {isTrump && (
        <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[8px] font-bold text-amber-900 shadow">
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
      <div className="text-lg text-indigo-400/50">&#x2660;</div>
    </div>
  );
}
