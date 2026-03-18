import type { Card as CardData } from "../logic/types";
import { CARD_COLORS, CARD_EMOJI, CARD_LABELS } from "../logic/types";

interface CardProps {
  card: CardData;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  faceDown?: boolean;
  glowing?: boolean;
  size?: "sm" | "md" | "lg";
}

const SIZE_CLASSES = {
  sm: "h-24 w-16 text-[10px]",
  md: "h-36 w-24 text-xs",
  lg: "h-44 w-28 text-sm",
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
  const color = CARD_COLORS[card.type];
  const sizeClass = SIZE_CLASSES[size];

  if (faceDown) {
    return (
      <div
        className={`${sizeClass} flex items-center justify-center rounded-xl bg-indigo-900 shadow-lg`}
      >
        <span className="text-2xl">🐱</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${sizeClass} relative flex flex-col items-center justify-center rounded-xl p-1.5 font-semibold text-white shadow-md transition ${
        selected ? "ring-2 ring-white ring-offset-2 ring-offset-gray-900 scale-105" : ""
      } ${glowing ? "ring-2 ring-yellow-400 animate-pulse" : ""} ${
        disabled
          ? "opacity-50 cursor-not-allowed"
          : "hover:scale-105 hover:shadow-xl cursor-pointer"
      }`}
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
  size?: "sm" | "md" | "lg";
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
