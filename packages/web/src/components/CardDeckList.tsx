import { CARD_DECKS, type CardDeck } from "@boardgames/core/games/card-decks";
import { useMemo } from "react";
import { cn } from "../lib/cn";
import { resolveGame } from "../lib/games-by-slug";
import { CheckIcon } from "./icons";

type Props = {
  /** Currently-checked slugs (may contain non-deck slugs; they're ignored). */
  selected: string[];
  /** Called with a deck pseudo-slug when its checkbox is toggled. */
  onToggle: (slug: string) => void;
};

/**
 * The two card-deck toggles — how traditional-deck card games are owned.
 * Durak / Rummy / Kings in the Corner / Schafkopf are not cells in the
 * catalog `InventoryGrid`; owning the French- or Bavarian-suited deck unlocks
 * them (`withDeckGames` in core). Rendered between the grid and the EXIT box
 * list in the admin inventory editors.
 */
export default function CardDeckList({ selected, onToggle }: Props) {
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  return (
    <section>
      <h3 className="mb-2 px-1 text-2xs font-bold uppercase tracking-pill text-fg-secondary">
        Card decks
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {CARD_DECKS.map((deck) => (
          <DeckCell
            key={deck.slug}
            deck={deck}
            checked={selectedSet.has(deck.slug)}
            onToggle={() => onToggle(deck.slug)}
          />
        ))}
      </div>
    </section>
  );
}

function DeckCell({
  deck,
  checked,
  onToggle,
}: {
  deck: CardDeck;
  checked: boolean;
  onToggle: () => void;
}) {
  const unlocks = deck.games.map((slug) => resolveGame(slug)?.title ?? slug).join(", ");
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition",
        checked
          ? "border-accent-400/50 bg-accent-500/10"
          : "border-white/10 bg-surface-800/50 hover:border-white/20",
      )}
    >
      {/* biome-ignore lint/correctness/noRestrictedElements: sr-only checkbox behind a custom row surface — no visible chrome to drift */}
      <input type="checkbox" checked={checked} onChange={onToggle} className="sr-only" />
      <span className="min-w-0 flex-1 text-xs">
        <span className="flex items-baseline gap-2">
          <span className="truncate font-semibold text-fg-primary">{deck.label}</span>
          <span className="shrink-0 text-3xs text-fg-muted">{deck.suits}</span>
        </span>
        <span className="block truncate text-3xs text-fg-muted">Unlocks {unlocks}</span>
      </span>
      {checked && <CheckIcon className="h-4 w-4 shrink-0 text-accent-300" />}
    </label>
  );
}
