import type { Card as CardData } from "@boardgames/core/games/exploding-kittens/types";
import {
  CARD_COLORS,
  CARD_EMOJI,
  CARD_LABELS,
} from "@boardgames/core/games/exploding-kittens/types";
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

  const ringClass = selected
    ? "ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-105"
    : glowing
      ? "ring-2 ring-yellow-400 animate-pulse"
      : "";

  const interactionClass = disabled
    ? "opacity-50 cursor-not-allowed"
    : "hover:shadow-xl cursor-pointer";

  if (skin) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`${sizeClass} relative overflow-hidden rounded-xl shadow-md transition ${ringClass} ${interactionClass}`}
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
      className={`${sizeClass} relative flex flex-col items-center justify-center rounded-xl p-1.5 font-semibold text-white shadow-md transition text-xs ${ringClass} ${interactionClass}`}
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
      className={`${sizeClass} flex items-center justify-center rounded-xl border-2 border-dashed border-gray-700 text-gray-600 text-xs`}
    >
      {label}
    </div>
  );
}
