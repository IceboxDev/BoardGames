import type { CardColor, CardId } from "@boardgames/core/games/7-wonders/types";
import { motion, useReducedMotion } from "framer-motion";
import { useRef } from "react";
import { cn } from "../../../../lib/cn";
import { COLOR_HEX, COLOR_LABEL, defOf, TABLEAU_ORDER } from "../../card-utils";
import { BAND_SHARE, CARD_ASPECT } from "../../logic/card-art";
import CardArt from "../CardArt";
import CardPreview from "../CardPreview";

interface Props {
  tableau: readonly CardId[];
  /** Cards built in the last reveal — they glow until the next one. */
  fresh?: ReadonlySet<CardId>;
  /** The selected hand card, shown translucent where it would go. */
  ghost?: CardId | null;
  className?: string;
}

/** The band's width : height (the card cut just below its band). */
const BAND_ASPECT = CARD_ASPECT / BAND_SHARE;
/** How much of a covered band shows: all of it down to its white key line. */
const TUCKED = 0.86;

/**
 * A city's built cards in seven colour columns, each card shown as its
 * printed band only — colour, name, what it gives — laid over the one
 * before it like cards on the table, the newest whole at the bottom; the
 * full card is a hover away. A very long column tucks the earlier bands
 * deeper (flexbox does it), so nothing scrolls or moves the board. Only a card built while
 * you watch drops in; the cards a city already had are simply there.
 */
export default function Tableau({ tableau, fresh, ghost, className }: Props) {
  // Mount it per city (`key`): what it shows first never animates.
  const known = useRef<ReadonlySet<CardId> | null>(null);
  known.current ??= new Set(tableau);
  const byColor = new Map<CardColor, CardId[]>();
  for (const id of tableau) {
    const c = defOf(id).color;
    byColor.set(c, [...(byColor.get(c) ?? []), id]);
  }
  const ghostColor = ghost ? defOf(ghost).color : null;

  return (
    <div
      className={cn("grid min-h-0 gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${TABLEAU_ORDER.length}, minmax(0, 1fr))` }}
    >
      {TABLEAU_ORDER.map((color) => (
        <Column
          key={color}
          color={color}
          cards={byColor.get(color) ?? []}
          fresh={fresh}
          ghost={ghostColor === color ? ghost : null}
          known={known.current}
        />
      ))}
    </div>
  );
}

function Column({
  color,
  cards,
  fresh,
  ghost,
  known,
}: {
  color: CardColor;
  cards: CardId[];
  fresh?: ReadonlySet<CardId>;
  ghost?: CardId | null;
  known: ReadonlySet<CardId> | null;
}) {
  const reduced = useReducedMotion();
  const items: { id: CardId; ghost: boolean }[] = cards.map((id) => ({ id, ghost: false }));
  if (ghost) items.push({ id: ghost, ghost: true });

  return (
    <section
      aria-label={`${COLOR_LABEL[color]}: ${cards.length}`}
      className="flex min-h-0 flex-col gap-1.5"
    >
      <header className="flex shrink-0 items-center gap-1.5 px-0.5">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/40"
          style={{ backgroundColor: COLOR_HEX[color] }}
        />
        <span className="truncate text-3xs font-semibold uppercase tracking-label text-fg-muted">
          {COLOR_LABEL[color]}
        </span>
        <span className="ml-auto text-2xs font-semibold tabular-nums text-fg-secondary">
          {cards.length || ""}
        </span>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        {items.length === 0 && (
          <div
            className="w-full rounded-card-md border border-dashed border-line-soft"
            style={{
              aspectRatio: `${BAND_ASPECT}`,
              background: `linear-gradient(180deg, ${COLOR_HEX[color]}14, transparent)`,
            }}
          />
        )}
        {items.map(({ id, ghost: isGhost }, i) => {
          const last = i === items.length - 1;
          const glow = !isGhost && (fresh?.has(id) ?? false);
          // The card cut just below its band, laid over the one before it.
          const band = (
            <div
              className={cn(
                "absolute inset-x-0 top-0 overflow-hidden rounded-card-md ring-1 ring-black/50 transition-shadow",
                glow && "ring-2 ring-amber-300/90",
                isGhost &&
                  "opacity-60 outline-2 outline-offset-1 outline-amber-300/80 outline-dashed saturate-50",
              )}
              style={{
                aspectRatio: `${BAND_ASPECT}`,
                // Each band casts a soft shadow up onto the card it covers.
                boxShadow: glow
                  ? "0 0 14px rgb(251 191 36 / 0.55), 0 -3px 8px rgb(0 0 0 / 0.45)"
                  : "0 -3px 8px rgb(0 0 0 / 0.45), 0 2px 4px rgb(0 0 0 / 0.3)",
              }}
            >
              <CardArt
                cardId={id}
                variant="stack"
                className="absolute inset-x-0 top-0 rounded-none shadow-none ring-0"
              />
            </div>
          );
          return (
            <motion.div
              key={isGhost ? `ghost-${id}` : id}
              initial={
                reduced || isGhost || known?.has(id) ? false : { opacity: 0, y: -12, scale: 0.96 }
              }
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: "spring", stiffness: 320, damping: 28 }}
              // The last band shows whole; each one before it is covered from its key
              // line down, and gives up more of itself when the column runs long.
              className={cn("relative w-full", last ? "shrink-0" : "min-h-0 shrink")}
              style={{ aspectRatio: `${last ? BAND_ASPECT : BAND_ASPECT / TUCKED}` }}
            >
              {isGhost ? (
                band
              ) : (
                <CardPreview cardId={id} className="block h-full w-full">
                  {band}
                </CardPreview>
              )}
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
