import { cardDef } from "@boardgames/core/games/the-hunger/content/cards";
import { cn } from "../../../lib/cn";
import { ROW_TONE, toneOf } from "../logic/card-colors";
import { CATEGORY_GLYPH } from "../logic/labels";
import CardPreview from "./CardPreview";

const KEYWORD_GLYPH: Record<string, string> = {
  fast: "⚡",
  slow: "🐢",
  spicy: "🌶",
  confuse: "😵",
  "holy-water": "💧",
  gregarious: "👥",
  ready: "↥",
  permanent: "∞",
  inspiring: "📜",
};

/**
 * One card as a compact row, edged in its kind's colour: Speed · glyph ·
 * name · keywords · VP, and with `detail` its rules text underneath.
 */
export default function CardLine({
  card,
  className,
  detail = false,
}: {
  card: string;
  className?: string;
  detail?: boolean;
}) {
  const def = cardDef(card);
  const speed = typeof def.speed === "number" ? def.speed : def.speed.base;
  const conditional = typeof def.speed !== "number";
  const glyph = def.category ? CATEGORY_GLYPH[def.category] : def.family === "rose" ? "🌹" : "🦇";
  const keywords = def.keywords.map((k) => KEYWORD_GLYPH[k] ?? "").join("");
  return (
    <CardPreview
      card={card}
      className={cn(
        "flex w-full flex-col rounded-ui-md border-l-4 px-1 py-0.5 text-left",
        ROW_TONE[toneOf(def)],
        className,
      )}
    >
      <span className="sr-only">
        {def.name}
        {def.text ? ` — ${def.text}` : ""}
      </span>
      <div className="flex w-full items-center gap-1 text-3xs leading-tight" aria-hidden>
        <span
          className={cn(
            "w-5 shrink-0 text-center font-bold tabular-nums",
            speed < 0 ? "text-rose-300" : speed > 0 ? "text-emerald-300" : "text-fg-muted",
          )}
        >
          {speed > 0 ? `+${speed}` : speed}
          {conditional ? "*" : ""}
        </span>
        <span aria-hidden>{glyph}</span>
        <span className="min-w-0 flex-1 truncate text-fg-primary">{def.name}</span>
        {keywords && <span aria-hidden>{keywords}</span>}
        {def.vp > 0 && <span className="font-bold text-amber-300 tabular-nums">{def.vp}</span>}
      </div>
      {detail && (def.text || def.keywords.length > 0) && (
        <div className="pl-6 text-4xs leading-snug text-fg-secondary">
          {def.keywords.length > 0 && (
            <span className="font-semibold italic">{def.keywords.join(" · ")} </span>
          )}
          {def.text}
        </div>
      )}
    </CardPreview>
  );
}
