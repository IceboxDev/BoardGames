// One resolver for everything an inventory can store. `resolveGame` only
// knows catalog slugs; EXIT boxes and deck pseudo-slugs are ownable without
// being catalog entries, and the three-way branch used to be re-derived at
// every consumer. Custom (free-text) collection items bypass this entirely —
// their title IS `customTitle`.

import { CARD_DECKS } from "@boardgames/core/games/card-decks";
import { exitGameBySlug, exitGameTitle } from "@boardgames/core/games/exit-games";
import { resolveGame } from "./games-by-slug.ts";

export type InventoryEntryKind = "catalog" | "exit" | "deck" | "unknown";

export interface InventoryEntry {
  kind: InventoryEntryKind;
  title: string;
  /** Bundled thumbnail URL — catalog games only; boxes/decks have no art. */
  thumbnail: string | null;
  bggId: number | null;
  /** Secondary line where one exists (deck suits, EXIT year). */
  detail: string | null;
}

export function resolveInventoryEntry(slug: string): InventoryEntry {
  const game = resolveGame(slug);
  if (game) {
    return {
      kind: "catalog",
      title: game.title,
      thumbnail: game.thumbnail,
      bggId: game.bggId,
      detail: null,
    };
  }
  const exit = exitGameBySlug(slug);
  if (exit) {
    return {
      kind: "exit",
      title: exitGameTitle(exit),
      thumbnail: null,
      bggId: exit.bggId,
      detail: String(exit.year),
    };
  }
  const deck = CARD_DECKS.find((d) => d.slug === slug);
  if (deck) {
    return { kind: "deck", title: deck.label, thumbnail: null, bggId: null, detail: deck.suits };
  }
  // Retired/unknown slug: keep the row renderable rather than dropping it.
  return { kind: "unknown", title: slug, thumbnail: null, bggId: null, detail: null };
}
