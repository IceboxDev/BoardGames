import type { Card as CardData } from "@boardgames/core/games/exploding-kittens/types";
import {
  CARD_COLORS,
  CARD_EMOJI,
  CARD_LABELS,
} from "@boardgames/core/games/exploding-kittens/types";
import { cardChrome } from "../../../components/card-fan/card-chrome";
import { getCardImageUrl, getCardSkin } from "../assets/card-art";

interface CardProps {
  card: CardData;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  faceDown?: boolean;
  glowing?: boolean;
  size?: "sm" | "md" | "lg" | "hand";
}

const SIZE_CLASSES = {
  sm: "h-24 w-16",
  md: "h-36 w-24",
  lg: "h-44 w-28",
  hand: "w-full aspect-[2/3]",
};

export default function Card({
  card,
  onClick,
  disabled = false,
  selected = false,
  faceDown = false,
  glowing = false,
  size = "md",
}: CardProps) {
  const sizeClass = SIZE_CLASSES[size];
  const skin = getCardSkin(card.type, card.id);

  if (faceDown) {
    return (
      <div
        className={`${sizeClass} flex items-center justify-center rounded-xl bg-indigo-900 shadow-lg`}
      >
        <span className="text-2xl">🐱</span>
      </div>
    );
  }

  const chromeOpts = {
    size: sizeClass,
    rounded: "xl",
    selected,
    glowClass: glowing ? "ring-2 ring-yellow-400 animate-pulse" : "",
    disabled,
    hover: "shadow",
  } as const;

  if (skin) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={cardChrome(chromeOpts)}
      >
        <img
          src={getCardImageUrl(skin.file)}
          alt={CARD_LABELS[card.type]}
          className="h-full w-full object-cover"
          draggable={false}
          loading="lazy"
        />
      </button>
    );
  }

  const color = CARD_COLORS[card.type];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cardChrome({
        ...chromeOpts,
        className:
          "flex flex-col items-center justify-center p-1.5 text-xs font-semibold text-white",
      })}
      style={{ backgroundColor: color }}
    >
      <span className="text-xl leading-none mb-1">{CARD_EMOJI[card.type]}</span>
      <span className="text-center leading-tight">{CARD_LABELS[card.type]}</span>
    </button>
  );
}

export function CardPlaceholder({
  label = "empty",
  size = "md",
}: {
  label?: string;
  size?: "sm" | "md" | "lg" | "hand";
}) {
  const sizeClass = SIZE_CLASSES[size];
  return (
    <div
      className={`${sizeClass} flex items-center justify-center rounded-xl border-2 border-dashed border-gray-700 text-fg-disabled text-xs`}
    >
      {label}
    </div>
  );
}
