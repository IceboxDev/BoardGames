import type { Card as CardData, ExpeditionColor } from "@boardgames/core/games/lost-cities/types";
import { COLOR_HEX, COLOR_LABELS } from "@boardgames/core/games/lost-cities/types";
import type { CSSProperties } from "react";
import { cn } from "../../../lib/cn";
import { artUrl, cardArtName } from "../logic/art";

// The card face: the expedition's painting under a black band with the value
// in both corners and the expedition glyph between them. The face scales with
// its own width (container units), so the same component is a 40 px card in a
// phone lane and a 130 px card in the fan. In a line only the band shows above
// the next card, so the band is exactly a fifth of the card's height.

const NUMBER_FONT = "Georgia, 'Palatino', 'Times New Roman', serif";
const EMBOSS = "0 -1px 0 rgba(255,255,255,0.22), 0 1px 2px rgba(0,0,0,0.8)";

const GLYPHS: Record<ExpeditionColor, React.ReactNode> = {
  white: (
    <>
      <path d="M12 2L2 22h20L12 2zm0 5l6.5 13h-13L12 7z" />
      <path d="M12 2l5 10h-10L12 2z" />
    </>
  ),
  blue: <path d="M12 2L9 9H3l5 4-2 7 6-4 6 4-2-7 5-4h-6L12 2z" />,
  green: (
    <>
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66C7.72 17.12 9.45 13 17 11V8z" />
      <path d="M17 2c-3 0-6 2-8 5 2-1 4-1.5 6-1.5V2z" />
      <path d="M17 8c-3.5 0-6.5 2.5-8.5 6 2-.5 4-.5 6-.5V8z" />
    </>
  ),
  yellow: (
    <>
      <circle cx="12" cy="12" r="5" />
      <path
        d="M12 1v3M12 20v3M4.22 4.22l2.12 2.12M17.66 17.66l2.12 2.12M1 12h3M20 12h3M4.22 19.78l2.12-2.12M17.66 6.34l2.12-2.12"
        stroke="currentColor"
        strokeWidth="2"
        fill="none"
      />
    </>
  ),
  red: (
    <>
      <path d="M12 23c-1 0-8-5.5-8-12.8C4 5.7 7.6 1 12 1s8 4.7 8 9.2C20 17.5 13 23 12 23zm0-19c-3 0-5.5 3.5-5.5 7.2 0 5 4 8.8 5.5 9.8 1.5-1 5.5-4.8 5.5-9.8C17.5 7.5 15 4 12 4z" />
      <circle cx="12" cy="11" r="3" />
    </>
  ),
};

/** The expedition's glyph, in its colour unless told otherwise. */
export function ExpeditionGlyph({
  color,
  className,
  style,
}: {
  color: ExpeditionColor;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      style={{ color: COLOR_HEX[color], ...style }}
    >
      {GLYPHS[color]}
    </svg>
  );
}

export function WagerGlyph({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      className={className}
      style={style}
    >
      <path d="M7 11L12 4L17 11" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7 17L12 10L17 17" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function cardLabel(card: CardData): string {
  return `${COLOR_LABELS[card.color]} ${card.type === "wager" ? "wager" : card.value}`;
}

function Value({ card }: { card: CardData }) {
  const hex = COLOR_HEX[card.color];
  if (card.type === "wager") {
    return <WagerGlyph style={{ color: hex, width: "22cqw", height: "22cqw" }} />;
  }
  return (
    <span
      className="leading-none"
      style={{
        color: hex,
        fontFamily: NUMBER_FONT,
        fontWeight: 900,
        fontStyle: "italic",
        fontSize: "25cqw",
        textShadow: EMBOSS,
      }}
    >
      {card.value}
    </span>
  );
}

export interface CardProps {
  card: CardData;
  /** Width in px (height is 1.5×). Without it the card fills its parent's width. */
  width?: number;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  /** Lit: a card you can take or play right now. */
  glowing?: boolean;
  /** Where the selected card would land — drawn faded and dashed. */
  ghost?: boolean;
  className?: string;
}

export default function Card({
  card,
  width,
  onClick,
  disabled = false,
  selected = false,
  glowing = false,
  ghost = false,
  className,
}: CardProps) {
  const hex = COLOR_HEX[card.color];
  const art = artUrl(cardArtName(card));
  const face = (
    <>
      <div
        className="relative z-lift flex w-full shrink-0 items-center justify-between bg-black"
        style={{ height: "30cqw", paddingInline: "8cqw" }}
      >
        <Value card={card} />
        <ExpeditionGlyph color={card.color} style={{ width: "20cqw", height: "20cqw" }} />
        <Value card={card} />
      </div>
      <div className="relative min-h-0 w-full flex-1">
        {art ? (
          <img
            src={art}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          // No painting yet (Volcano until its batch is generated).
          <div
            className="absolute inset-0 grid place-items-center"
            style={{
              background: `radial-gradient(120% 90% at 50% 100%, color-mix(in srgb, ${hex} 55%, black) 0%, color-mix(in srgb, ${hex} 12%, black) 70%)`,
            }}
          >
            <ExpeditionGlyph
              color={card.color}
              className="opacity-35"
              style={{ width: "46cqw", height: "46cqw" }}
            />
          </div>
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/15 via-transparent to-black/35" />
      </div>
    </>
  );
  const cls = cn(
    "relative flex shrink-0 flex-col overflow-hidden bg-black shadow-md ring-1 ring-black",
    "aspect-card transition-shadow duration-150",
    width == null && "w-full",
    selected && "ring-2 ring-accent-400 shadow-glow-accent",
    !selected && glowing && "ring-2 ring-accent-400 shadow-glow-accent",
    ghost && "opacity-50 outline-2 outline-offset-2 outline-dashed outline-accent-400 shadow-none",
    className,
  );
  const style: CSSProperties = {
    width,
    containerType: "inline-size",
    // A card's own container units resolve against its parent, so the corner
    // is a percentage: 7% of the width, the same length down a 2:3 card.
    borderRadius: "7% / 4.667%",
  };
  if (onClick && !disabled) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cn(cls, "cursor-pointer")}
        style={style}
        aria-label={cardLabel(card)}
      >
        {face}
      </button>
    );
  }
  return (
    <div className={cls} style={style} title={cardLabel(card)}>
      {face}
    </div>
  );
}

/** A card as a small value chip: the opponent's lines and other tight spots. */
export function CardChip({ card, height }: { card: CardData; height: number }) {
  const hex = COLOR_HEX[card.color];
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center bg-black"
      title={cardLabel(card)}
      style={{
        height,
        borderRadius: 4,
        border: `1px solid color-mix(in srgb, ${hex} 45%, transparent)`,
        color: hex,
        fontFamily: NUMBER_FONT,
        fontStyle: "italic",
        fontWeight: 900,
        fontSize: height * 0.62,
      }}
    >
      {card.type === "wager" ? (
        <WagerGlyph style={{ width: height * 0.55, height: height * 0.55 }} />
      ) : (
        card.value
      )}
    </span>
  );
}
