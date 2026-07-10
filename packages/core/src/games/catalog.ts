// The game catalog — every browse-able game — and the canonical set of valid
// game slugs derived from it.
//
// The JSON lives in `core` rather than `web` because it is the authority for
// *both* sides of the wire: the web registry renders it, and the server
// validates inbound slugs against it (an inventory holding a slug that names no
// real game silently drops that game from availability — see
// `CatalogSlugListSchema` in `protocol/http/inventory.ts`).
//
// The raw array is typed structurally here and Zod-validated at web's registry
// bootstrap (`web/src/games/catalog-schema.ts`), which owns the full entry
// shape. This module deliberately stays narrow: slugs, and the lookup built
// from them.

import catalogRaw from "./catalog.json" with { type: "json" };

/** Structural view of a catalog entry — only the fields core needs. */
export type CatalogSlugEntry = { slug: string };

/** The raw catalog array, as committed. Validated downstream by web. */
export const CATALOG: readonly CatalogSlugEntry[] = catalogRaw;

/** Every slug that names a real game. */
export const CATALOG_SLUGS: ReadonlySet<string> = new Set(CATALOG.map((g) => g.slug));

/** True when `slug` names a game that exists in the catalog. */
export function isCatalogSlug(slug: string): boolean {
  return CATALOG_SLUGS.has(slug);
}
