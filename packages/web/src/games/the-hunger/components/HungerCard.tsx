import { cardDef } from "@boardgames/core/games/the-hunger/content/cards";
import type { CardDef } from "@boardgames/core/games/the-hunger/types";
import { cardChrome } from "../../../components/card-fan/card-chrome";
import { cn } from "../../../lib/cn";
import { FACE_TONE, toneOf } from "../logic/card-colors";
import { CATEGORY_GLYPH, CATEGORY_LABEL } from "../logic/labels";

export type HungerCardSize = "hand" | "track" | "mini";

const SIZE: Record<HungerCardSize, string> = {
  hand: "w-full aspect-card",
  track: "w-16 sm:w-20 aspect-card",
  mini: "w-10 aspect-card",
};

function speedText(def: CardDef): string {
  const s = def.speed;
  if (typeof s === "number") return s > 0 ? `+${s}` : String(s);
  return `${s.base}*`;
}

const KEYWORD_LABEL: Record<string, string> = {
  fast: "Fast",
  slow: "Slow",
  spicy: "Spicy",
  confuse: "Confuse",
  "holy-water": "Holy Water",
  gregarious: "Gregarious",
  ready: "Ready",
  permanent: "Permanent",
  unique: "Unique",
  inspiring: "Inspiring",
};

interface Props {
  card: string;
  size?: HungerCardSize;
  selected?: boolean;
  glowing?: boolean;
  disabled?: boolean;
  /** Dim a card whose step-1 effect has been used. */
  spent?: boolean;
  className?: string;
}

export default function HungerCard({
  card,
  size = "hand",
  selected = false,
  glowing = false,
  disabled = false,
  spent = false,
  className,
}: Props) {
  const def = cardDef(card);
  const mini = size === "mini";
  const keywords = def.keywords.map((k) => KEYWORD_LABEL[k] ?? k).join(" · ");
  const typeLabel =
    def.type === "human" && def.category
      ? CATEGORY_LABEL[def.category]
      : def.type === "starting"
        ? "Starting"
        : def.type[0].toUpperCase() + def.type.slice(1);

  return (
    <div
      className={cn(
        cardChrome({
          size: SIZE[size],
          rounded: mini ? "lg" : "xl",
          selected,
          disabled,
          glowClass: glowing ? "ring-2 ring-amber-400/80 shadow-glow-amber" : "",
          hover: "none",
          className: cn("flex flex-col border border-line-strong", FACE_TONE[toneOf(def)]),
        }),
        spent && "opacity-60",
        className,
      )}
      title={`${def.name} — ${typeLabel}${def.text ? `: ${def.text}` : ""}`}
    >
      <div className="flex items-start justify-between p-1">
        <span
          className={cn(
            "flex items-center justify-center rounded-full bg-black/60 font-bold text-white tabular-nums",
            mini ? "h-4 w-4 text-5xs" : "h-6 w-6 text-2xs",
          )}
          title={`Speed ${speedText(def)}`}
        >
          {speedText(def)}
        </span>
        {def.vp > 0 && (
          <span
            className={cn(
              "flex items-center justify-center rounded-full bg-rose-900 font-bold text-white tabular-nums",
              mini ? "h-4 w-4 text-5xs" : "h-6 w-6 text-2xs",
            )}
            title={`${def.vp} VP`}
          >
            {def.vp}
          </span>
        )}
      </div>
      {!mini && (
        <>
          <div className="flex flex-1 items-center justify-center text-2xl" aria-hidden>
            {def.category ? CATEGORY_GLYPH[def.category] : def.family === "rose" ? "🌹" : "🦇"}
          </div>
          <div className="px-1.5 pb-1.5">
            <div className="truncate text-2xs font-bold leading-tight">{def.name}</div>
            <div className="text-4xs opacity-80">{typeLabel}</div>
            {keywords && <div className="text-4xs font-semibold italic">{keywords}</div>}
            {def.text && size === "hand" && (
              <div className="mt-0.5 line-clamp-3 text-4xs leading-tight opacity-90">
                {def.text}
              </div>
            )}
          </div>
        </>
      )}
      {mini && <div className="truncate px-0.5 pb-0.5 text-6xs font-semibold">{def.name}</div>}
    </div>
  );
}
