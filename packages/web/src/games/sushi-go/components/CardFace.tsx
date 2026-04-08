import type { CardType } from "@boardgames/core/games/sushi-go/types";
import { CARD_LABELS } from "@boardgames/core/games/sushi-go/types";
import type { CardSize } from "./card-utils";
import { getCardImageUrl, SIZE_CLASSES } from "./card-utils";

interface CardFaceProps {
  type: CardType;
  size?: CardSize;
  selected?: boolean;
  disabled?: boolean;
  wasabiBoosted?: boolean;
  onClick?: () => void;
  className?: string;
}

export default function CardFace({
  type,
  size = "md",
  selected,
  disabled,
  wasabiBoosted,
  onClick,
  className,
}: CardFaceProps) {
  const imageUrl = getCardImageUrl(type);

  const ringClass = selected
    ? "ring-2 ring-white ring-offset-1 ring-offset-gray-900 scale-105"
    : wasabiBoosted
      ? "ring-2 ring-green-400/60"
      : "";

  const interactionClass = disabled
    ? "opacity-50 cursor-default"
    : onClick
      ? "hover:scale-105 cursor-pointer"
      : "";

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled && !selected}
      className={`${SIZE_CLASSES[size]} relative overflow-hidden rounded-lg border-2 border-gray-700/60 shadow-md transition-all ${ringClass} ${interactionClass} ${className ?? ""}`}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={CARD_LABELS[type]}
          className="h-full w-full object-cover"
          draggable={false}
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gray-800 text-xs text-gray-400">
          {CARD_LABELS[type]}
        </div>
      )}
      {wasabiBoosted && (
        <span className="absolute -bottom-0.5 -right-0.5 text-xs drop-shadow">🌿</span>
      )}
    </button>
  );
}

/** Card for the fan hand — uses the full-width `hand` size variant. */
export function CardFaceHand({
  type,
  selected,
  disabled,
  wasabiBoosted,
}: Omit<CardFaceProps, "size" | "onClick" | "className">) {
  const imageUrl = getCardImageUrl(type);

  const ringClass = selected
    ? "ring-2 ring-white ring-offset-1 ring-offset-gray-900 scale-105"
    : wasabiBoosted
      ? "ring-2 ring-green-400/60"
      : "";

  const opacityClass = disabled ? "opacity-50" : "";

  return (
    <div
      className={`${SIZE_CLASSES.hand} relative overflow-hidden rounded-xl border-2 border-gray-700/60 shadow-lg ${ringClass} ${opacityClass}`}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={CARD_LABELS[type]}
          className="h-full w-full object-cover"
          draggable={false}
          loading="lazy"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gray-800 text-xs text-gray-400">
          {CARD_LABELS[type]}
        </div>
      )}
      {wasabiBoosted && (
        <span className="absolute bottom-0.5 right-0.5 text-sm drop-shadow">🌿</span>
      )}
    </div>
  );
}
