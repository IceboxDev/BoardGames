import type { CardId } from "@boardgames/core/games/7-wonders/types";
import { COLOR_HEX, costText, defOf, effectLabel } from "../card-utils";

interface CardFaceProps {
  cardId: CardId;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  className?: string;
}

/**
 * CSS-rendered card face (no scanned art in v1): color band with the name,
 * effect summary in the middle, cost row at the bottom.
 */
export default function CardFace({
  cardId,
  selected,
  disabled,
  onClick,
  className,
}: CardFaceProps) {
  const def = defOf(cardId);
  const hex = COLOR_HEX[def.color];
  const cost = costText(def.cost);

  const ringClass = selected
    ? "ring-2 ring-white ring-offset-1 ring-offset-gray-900 scale-105"
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
      className={`relative flex h-full w-full flex-col overflow-hidden rounded-lg border border-white/15 bg-surface-800 text-left shadow-md transition-all ${ringClass} ${interactionClass} ${className ?? ""}`}
    >
      <div
        className="px-1.5 py-1 text-3xs font-bold leading-tight text-white"
        style={{ backgroundColor: hex }}
      >
        {def.name}
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-0.5 px-1 text-center">
        {def.effects.map((effect) => (
          <span key={effectLabel(effect)} className="text-2xs leading-tight text-fg-primary">
            {effectLabel(effect)}
          </span>
        ))}
        {def.chainFrom && (
          <span className="text-4xs italic leading-tight text-fg-disabled">
            ⛓ {def.chainFrom.join(" / ")}
          </span>
        )}
      </div>
      <div className="flex items-center justify-between px-1.5 pb-1">
        <span className="text-3xs text-fg-secondary">{cost || "free"}</span>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: hex }} title={def.color} />
      </div>
    </button>
  );
}

/** Fan variant — fills the CardFan slot (portrait aspect). */
export function CardFaceHand({
  cardId,
  selected,
  disabled,
}: Omit<CardFaceProps, "onClick" | "className">) {
  return (
    <div className="aspect-[2/3] w-full">
      <CardFace cardId={cardId} selected={selected} disabled={disabled} />
    </div>
  );
}
