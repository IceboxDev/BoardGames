import type { CardId } from "@boardgames/core/games/7-wonders/types";
import { cardIdName } from "@boardgames/core/games/7-wonders/types";
import type { ReactNode } from "react";
import { cn } from "../../../lib/cn";
import { COLOR_HEX, COLOR_LABEL, defOf } from "../card-utils";
import { CARD_ASPECT, shade, spriteCell, spriteStyle } from "../logic/card-art";
import { CostIcons, EffectIcons } from "./CardBits";

export type CardArtVariant = "fan" | "stack" | "mini" | "showcase";

/**
 * The blank name scroll printed across the top of every card, as a share of
 * the card (the whole 255 × 393 cell): the cream band runs x 44–212, y 10–25.
 */
const SCROLL = { left: "17.25%", right: "16.86%", top: "2.54%", height: "3.82%" } as const;

interface Props {
  cardId: CardId;
  variant?: CardArtVariant;
  selected?: boolean;
  /** Greyed and inert (e.g. not your pick). */
  disabled?: boolean;
  /** A soft gold glow — freshly built, or a target. */
  glow?: boolean;
  /** Translucent — where a card would go. */
  ghost?: boolean;
  /** Pinned to the top-right corner (affordability). */
  badge?: ReactNode;
  /** Over the whole card (a "Chosen" stamp). */
  stamp?: ReactNode;
  className?: string;
}

/**
 * A 7 Wonders card: the printed second-edition face (the edition we play),
 * with its name lettered into the blank scroll across the top — the sheet
 * prints none. A card the sheet lacks gets a drawn face instead.
 */
export default function CardArt({
  cardId,
  variant = "fan",
  selected = false,
  disabled = false,
  glow = false,
  ghost = false,
  badge,
  stamp,
  className,
}: Props) {
  const name = cardIdName(cardId);
  const def = defOf(cardId);
  const hex = COLOR_HEX[def.color];
  const cell = spriteCell(name);

  return (
    <div
      className={cn(
        "relative w-full select-none overflow-hidden rounded-card-md bg-surface-900 shadow-lg ring-1 ring-black/50 transition-all duration-200",
        selected && "ring-2 ring-amber-300",
        glow && !selected && "ring-2 ring-amber-300/80 shadow-glow-amber",
        disabled && "opacity-45 saturate-50",
        ghost &&
          "opacity-60 outline-2 outline-offset-2 outline-amber-300/80 outline-dashed saturate-50",
        className,
        // Lifted, glowing and a heavier outline, in whatever colour it has.
        selected && "-translate-y-1 ring-4 shadow-glow-amber",
      )}
      style={{
        // The printed card's own shape, so no edge of its art is ever cropped.
        aspectRatio: `${CARD_ASPECT}`,
        containerType: "inline-size",
        ...(cell !== undefined && spriteStyle(cell, CARD_ASPECT)),
      }}
      title={`${name} — ${COLOR_LABEL[def.color]}`}
    >
      {cell !== undefined ? (
        variant !== "mini" && (
          <span
            className="absolute flex items-center justify-center overflow-hidden whitespace-nowrap font-fantasy font-bold uppercase leading-none"
            style={{ ...SCROLL, color: SCROLL_INK, fontSize: "4.6cqw" }}
          >
            {/* The face's line box sits its capitals high; centre the capitals themselves. */}
            <span style={{ transform: "translateY(0.18em)" }}>{name}</span>
          </span>
        )
      ) : (
        <DrawnFace cardId={cardId} hex={hex} variant={variant} />
      )}

      {badge && <div className="absolute right-1 top-1 z-lift">{badge}</div>}
      {stamp && (
        <div className="absolute inset-0 z-raised flex items-center justify-center">{stamp}</div>
      )}
    </div>
  );
}

/** Dark ink on the printed parchment scroll. */
const SCROLL_INK = "#4a2f1c";

const ICON_SIZE = { fan: "md", stack: "sm", mini: "xs", showcase: "lg" } as const;

/** A face for a card the sheet has no art for: colour, effect, name, cost. */
function DrawnFace({
  cardId,
  hex,
  variant,
}: {
  cardId: CardId;
  hex: string;
  variant: CardArtVariant;
}) {
  const def = defOf(cardId);
  return (
    <div
      className="absolute inset-0 flex flex-col items-center gap-1 p-1"
      style={{
        background: `linear-gradient(180deg, ${hex} 0%, ${shade(hex, -0.6)} 100%)`,
      }}
    >
      <span className="max-w-full truncate font-fantasy text-3xs font-semibold uppercase text-white text-shadow-md">
        {cardIdName(cardId)}
      </span>
      {def.effects.map((e, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a card's effects never reorder
        <EffectIcons key={i} effect={e} size={ICON_SIZE[variant]} />
      ))}
      <span className="mt-auto self-start">
        <CostIcons cost={def.cost} size="xs" direction="col" />
      </span>
    </div>
  );
}
