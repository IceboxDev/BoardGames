import { isNinja, suitOf } from "@boardgames/core/games/senso-battle-for-japan/deck";
import type { CardId, Clan } from "@boardgames/core/games/senso-battle-for-japan/types";
import { CLAN_LABELS } from "@boardgames/core/games/senso-battle-for-japan/types";
import type { CSSProperties } from "react";
import { cardChrome } from "../../../components/card-fan/card-chrome";
import { cn } from "../../../lib/cn";
import { CARD_BACK, CARD_BACK_MON, CARD_PAPER, CARD_PAPER_EDGE, CLAN_STROKE } from "../colors";
import { cardSpokenLabel } from "../logic/cards";
import CardBack from "./card/CardBack";
import CardFace from "./card/CardFace";
import type { SensoCardSize } from "./card/card-layout";

interface SensoCardProps {
  card: CardId;
  size?: SensoCardSize;
  selected?: boolean;
  glowing?: boolean;
  disabled?: boolean;
  /** Mark the advantage suit with the seal and the gold bar under the rank. */
  trump?: Clan | null;
  /** Advantage-row card: the clan only, no rank. */
  clanOnly?: boolean;
  /** Replace the spoken label (e.g. "…, played 2nd by Aydan" on the table). */
  ariaLabel?: string;
  onClick?: () => void;
  className?: string;
}

// The face is drawn on the card's own grid (`card/card-layout.ts`) and sized
// by the card's width, so a size here only decides the box and the level of
// detail: `hand` and `play` fill whatever box they are given (the fan's 160 px,
// the table's 120 canvas px), `table` and `mini` are fixed widths.
const SIZE_CLASSES: Record<SensoCardSize, string> = {
  hand: "w-full aspect-card",
  play: "w-full aspect-card",
  table: "w-14 sm:w-16 aspect-card",
  mini: "w-9 aspect-card",
};

export default function SensoCard({
  card,
  size = "table",
  selected = false,
  glowing = false,
  disabled = false,
  trump,
  clanOnly = false,
  ariaLabel,
  onClick,
  className,
}: SensoCardProps) {
  const suit = suitOf(card);
  const isTrump = !isNinja(card) && trump != null && suit === trump;
  const label =
    ariaLabel ?? (clanOnly && suit ? `${CLAN_LABELS[suit]} clan` : cardSpokenLabel(card));

  // The caller's className is merged last so a `w-full` beats the size's `w-9`
  // (the advantage row sizes its minis in canvas px).
  const chrome = cn(
    cardChrome({
      size: SIZE_CLASSES[size],
      rounded: size === "mini" ? "lg" : "xl",
      selected,
      glowClass: glowing ? "ring-2 ring-amber-400/80 shadow-glow-amber" : "",
      disabled,
      hover: onClick ? "lift" : "none",
      className: "border text-left",
    }),
    className,
  );
  // A clan-only mini has no ribbon or index, so its edge carries the clan.
  const style: CSSProperties = {
    background: CARD_PAPER,
    borderColor: clanOnly && size === "mini" && suit ? CLAN_STROKE[suit] : CARD_PAPER_EDGE,
  };
  const face = <CardFace card={card} size={size} clanOnly={clanOnly} trump={isTrump} />;

  if (onClick) {
    return (
      // biome-ignore lint/correctness/noRestrictedElements: a card face is a game piece (like durak's Card.tsx), not app chrome
      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        aria-label={label}
        aria-pressed={selected}
        className={chrome}
        style={style}
      >
        {face}
      </button>
    );
  }
  return (
    <div className={chrome} style={style} aria-label={label} role="img">
      {face}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Face-down card
// ---------------------------------------------------------------------------

export function SensoCardBack({
  size = "table",
  className,
  style,
}: {
  size?: SensoCardSize;
  className?: string;
  /** Extra inline sizing — the trick table sizes backs in canvas px. */
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        SIZE_CLASSES[size],
        "relative overflow-hidden border shadow-md",
        size === "mini" ? "rounded-card-lg" : "rounded-card-xl",
        className,
      )}
      style={{ background: CARD_BACK, borderColor: CARD_BACK_MON, ...style }}
    >
      <CardBack size={size} />
    </div>
  );
}
