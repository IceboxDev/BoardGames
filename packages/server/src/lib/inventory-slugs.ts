// Pure list-rewrite helpers for `user_inventory.game_slugs_json`.
//
// Every write path that mutates the stored slug list (played-through,
// self-remove, announcement approval) reads the current JSON, rewrites it
// here, and persists the result in the same `db.batch(..., "write")` as its
// sibling statements. Dedupe on every rewrite mirrors the admin PUT
// (`admin-inventory.ts`), so a historically duplicated slug heals on touch.

/** The list with `slug` present exactly once (dedupes as a side effect). */
export function withSlugAdded(slugs: readonly string[], slug: string): string[] {
  const set = new Set(slugs);
  set.add(slug);
  return [...set];
}

/** The list without `slug` (dedupes as a side effect). */
export function withSlugRemoved(slugs: readonly string[], slug: string): string[] {
  const set = new Set(slugs);
  set.delete(slug);
  return [...set];
}
