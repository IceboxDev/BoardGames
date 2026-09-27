import { cardDef } from "@boardgames/core/games/the-hunger/content/cards";
import type { CardDef } from "@boardgames/core/games/the-hunger/types";
import { cardChrome } from "../../../components/card-fan/card-chrome";
import { cn } from "../../../lib/cn";
import { CATEGORY_LABEL } from "../logic/labels";
import CompactFace from "./card/CompactFace";
import ShowcaseFace from "./card/ShowcaseFace";
import { cardHex, skin } from "./card/style";

export type HungerCardSize = "hand" | "track" | "mini" | "fill-height";

const SIZE: Record<HungerCardSize, string> = {
  hand: "w-full aspect-card",
  track: "w-16 sm:w-20 aspect-card",
  mini: "w-10 aspect-card",
  /** As tall as its container, as wide as the card's shape then makes it. */
  "fill-height": "h-full aspect-card",
};

interface Props {
  card: string;
  size?: HungerCardSize;
  /**
   * `compact` (default): the card in place — on the track, a board, a
   * dialog. `showcase`: the one card being inspected, large, every keyword
   * spelled out.
   */
  variant?: "compact" | "showcase";
  selected?: boolean;
  glowing?: boolean;
  disabled?: boolean;
  /** Dim a card whose step-1 effect has been used. */
  spent?: boolean;
  className?: string;
}

function typeLabel(def: CardDef): string {
  if (def.type === "human" && def.category) return CATEGORY_LABEL[def.category];
  if (def.type === "starting") return "Starting";
  return def.type[0].toUpperCase() + def.type.slice(1);
}

/**
 * A The Hunger card: full art with its text on a scrim, framed by nothing but
 * a hairline in its colour. The faces live in `card/`; this owns the size,
 * the shared selected / glowing / disabled chrome, and the accessible name.
 */
export default function HungerCard({
  card,
  size = "hand",
  variant = "compact",
  selected = false,
  glowing = false,
  disabled = false,
  spent = false,
  className,
}: Props) {
  const def = cardDef(card);
  const showcase = variant === "showcase";
  return (
    <div
      className={cn(
        cardChrome({
          size: SIZE[size],
          rounded: size === "mini" ? "lg" : "xl",
          selected,
          disabled,
          glowClass: glowing ? "ring-2 ring-amber-400/80 shadow-glow-amber" : "",
          hover: "none",
          className: cn("relative isolate overflow-hidden", showcase && "rounded-card-2xl"),
        }),
        className,
      )}
      style={skin(cardHex(def), showcase ? 28 : 12)}
      title={
        showcase ? undefined : `${def.name} — ${typeLabel(def)}${def.text ? `: ${def.text}` : ""}`
      }
    >
      {showcase ? (
        <ShowcaseFace card={card} />
      ) : (
        <CompactFace card={card} mini={size === "mini"} dim={spent} />
      )}
    </div>
  );
}
