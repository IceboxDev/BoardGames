import { isNinja, suitOf } from "@boardgames/core/games/senso-battle-for-japan/deck";
import type { CardId, Clan } from "@boardgames/core/games/senso-battle-for-japan/types";
import {
  CLAN_KANJI,
  CLAN_LABELS,
  CLAN_SHORT,
} from "@boardgames/core/games/senso-battle-for-japan/types";
import { cardChrome } from "../../../components/card-fan/card-chrome";
import { cn } from "../../../lib/cn";
import {
  CARD_BACK,
  CARD_BACK_MON,
  CARD_PAPER,
  CARD_PAPER_EDGE,
  CLAN_ACCENT,
  CLAN_FILL,
  CLAN_INK,
  CLAN_STROKE,
  NINJA_FILL,
  NINJA_INK,
} from "../colors";
import { cardSpokenLabel, rankGlyph } from "../logic/cards";

export type SensoCardSize = "hand" | "table" | "mini";

interface SensoCardProps {
  card: CardId;
  size?: SensoCardSize;
  selected?: boolean;
  glowing?: boolean;
  disabled?: boolean;
  /** Mark the advantage suit with the amber corner tab. */
  trump?: Clan | null;
  /** Advantage-row mini card: the clan only, no rank. */
  clanOnly?: boolean;
  onClick?: () => void;
  className?: string;
}

const SIZE_CLASSES: Record<SensoCardSize, string> = {
  hand: "w-full aspect-card",
  table: "w-14 sm:w-16 aspect-card",
  mini: "w-9 aspect-card",
};

const BAND_TEXT: Record<SensoCardSize, string> = {
  hand: "text-base",
  table: "text-xs",
  mini: "text-4xs",
};

const BODY_TEXT: Record<SensoCardSize, string> = {
  hand: "text-4xl",
  table: "text-xl",
  mini: "text-sm",
};

export default function SensoCard({
  card,
  size = "table",
  selected = false,
  glowing = false,
  disabled = false,
  trump,
  clanOnly = false,
  onClick,
  className,
}: SensoCardProps) {
  const ninja = isNinja(card);
  const suit = suitOf(card);
  const band = ninja ? NINJA_FILL[card] : suit ? CLAN_FILL[suit] : CARD_PAPER_EDGE;
  const ink = ninja ? NINJA_INK : suit ? CLAN_INK[suit] : "#000";
  const body = ninja ? NINJA_FILL[card] : suit ? CLAN_STROKE[suit] : "#000";
  const accent = ninja ? NINJA_FILL[card] : suit ? CLAN_ACCENT[suit] : "#000";
  const kanji = ninja ? "忍" : suit ? CLAN_KANJI[suit] : "";
  const rank = rankGlyph(card);
  const isTrump = !ninja && trump != null && suit === trump;
  const label = clanOnly && suit ? `${CLAN_LABELS[suit]} clan` : cardSpokenLabel(card);

  const inner = (
    <>
      <div
        className={cn(
          "flex shrink-0 items-center justify-between px-[8%] py-[3%] font-black leading-none",
          BAND_TEXT[size],
        )}
        style={{ background: band, color: ink }}
      >
        <span>{clanOnly ? "" : rank}</span>
        <span className="font-semibold">
          {ninja ? (card === "ninja-jade" ? "玉" : "木") : suit ? CLAN_SHORT[suit] : ""}
        </span>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center">
        <span
          className={cn("font-bold leading-none", BODY_TEXT[size], ninja && "tracking-tight")}
          style={{ color: body }}
        >
          {ninja ? "忍" : kanji}
        </span>
      </div>
      {!clanOnly && (
        <div
          className={cn(
            "shrink-0 self-end rotate-180 px-[8%] pb-[3%] font-black leading-none",
            BAND_TEXT[size],
          )}
          style={{ color: accent === "#f5f5f4" ? body : band }}
        >
          {rank}
        </div>
      )}
      {isTrump && (
        <div className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-5xs font-bold text-amber-900 shadow">
          T
        </div>
      )}
    </>
  );

  const chrome = cardChrome({
    size: SIZE_CLASSES[size],
    rounded: size === "mini" ? "lg" : "xl",
    selected,
    glowClass: glowing ? "ring-2 ring-amber-400/80 shadow-glow-amber" : "",
    disabled,
    hover: onClick ? "lift" : "none",
    className: cn("flex flex-col border text-left", className),
  });
  const style = { background: CARD_PAPER, borderColor: CARD_PAPER_EDGE };

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
        {inner}
      </button>
    );
  }
  return (
    <div className={chrome} style={style} aria-label={label} role="img">
      {inner}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Face-down card
// ---------------------------------------------------------------------------

export function SensoCardBack({
  size = "table",
  className,
}: {
  size?: SensoCardSize;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        SIZE_CLASSES[size],
        "flex items-center justify-center border shadow-md",
        size === "mini" ? "rounded-card-lg" : "rounded-card-xl",
        className,
      )}
      style={{ background: CARD_BACK, borderColor: CARD_BACK_MON }}
    >
      <span
        className={cn(
          "flex items-center justify-center rounded-full border font-bold",
          size === "hand"
            ? "h-12 w-12 text-2xl"
            : size === "table"
              ? "h-7 w-7 text-sm"
              : "h-4 w-4 text-4xs",
        )}
        style={{ borderColor: CARD_BACK_MON, color: CARD_BACK_MON }}
      >
        戦
      </span>
    </div>
  );
}
