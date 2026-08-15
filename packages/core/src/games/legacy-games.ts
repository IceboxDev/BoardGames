// Destroy-on-play ("legacy") games — one-shot boxes that are consumed by
// playing them: components get cut, folded, or written on, so a finished
// playthrough physically destroys the copy. The collection manager lets
// owners mark such a game "played through", which removes it from their
// owned games while keeping the collection record as history.
//
// Every EXIT box qualifies (`exit-games.ts`); the catalog set below lists
// the non-EXIT one-shots. Adding a future legacy game is a one-line change.

import { isExitGameSlug } from "./exit-games.ts";

export const LEGACY_DESTRUCTIBLE_CATALOG_SLUGS: ReadonlySet<string> = new Set([
  "medical-mysteries-nyc",
  "medical-mysteries-miami",
]);

/** Whether playing this game to completion destroys the physical copy. */
export function isLegacyDestructible(slug: string): boolean {
  return isExitGameSlug(slug) || LEGACY_DESTRUCTIBLE_CATALOG_SLUGS.has(slug);
}
