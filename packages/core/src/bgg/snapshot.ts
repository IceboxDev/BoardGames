// The BGG snapshot every consumer reads — WITH the catalog's `bggOverrides`
// already applied.
//
// `snapshot.json` is what `pnpm bgg-sync` pulled from BoardGameGeek. Some of
// it is wrong for this club: party games like Codenames are listed at "2–8"
// when they scale to any headcount, so `catalog.json` carries per-entry
// `bggOverrides` (e.g. `maxPlayers: "infinity"`). Those overrides used to be
// merged only in the web registry, which meant the browser showed "2–∞"
// while the server's "playable tonight" filter (which decides whose votes
// count and what reaches the top-5) still used the raw cap and silently
// dropped every vote for those games on a nine-person night.
//
// The merge now happens here, once, at module load. `bggSnapshot`,
// `getBggBySlug` and `getBggByBggId` all return merged entries; the raw
// snapshot stays available as `rawBggSnapshot` for tooling that needs to
// know what BGG actually said.

import catalogRaw from "../games/catalog.json" with { type: "json" };
import type { BggGame, BggSnapshot } from "../protocol/http/bgg.ts";
import { BggGameSchema } from "../protocol/http/bgg.ts";
import snapshotJson from "./snapshot.json";

export type { BggGame, BggSnapshot };

/** The snapshot exactly as synced from BGG. Prefer `bggSnapshot`. */
export const rawBggSnapshot: BggSnapshot = snapshotJson as BggSnapshot;

/** Structural view of a catalog entry — only what the merge needs. */
type OverrideCarrier = { readonly slug: string; readonly bggOverrides?: unknown };

const OverridesSchema = BggGameSchema.partial();

/**
 * `slug → bggOverrides` for every catalog entry that has any. Validated
 * against the BGG entry schema so a typo in `catalog.json` fails loudly at
 * boot rather than producing an entry no consumer can parse.
 */
function collectOverrides(entries: readonly OverrideCarrier[]): Map<string, Partial<BggGame>> {
  const overrides = new Map<string, Partial<BggGame>>();
  for (const entry of entries) {
    if (entry.bggOverrides === undefined) continue;
    const parsed = OverridesSchema.safeParse(entry.bggOverrides);
    if (!parsed.success) {
      throw new Error(
        `[bgg] catalog.json: invalid bggOverrides for "${entry.slug}": ${parsed.error.issues
          .map((i) => `${i.path.join(".")} ${i.message}`)
          .join("; ")}`,
      );
    }
    overrides.set(entry.slug, parsed.data);
  }
  return overrides;
}

/** Shallow-merge each catalog override over its snapshot entry. Nested
 *  objects are replaced wholesale, not deep-merged. */
export function applyCatalogOverrides(
  raw: BggSnapshot,
  overrides: ReadonlyMap<string, Partial<BggGame>>,
): BggSnapshot {
  const merged: Record<string, BggGame> = {};
  for (const [slug, entry] of Object.entries(raw)) {
    const patch = overrides.get(slug);
    merged[slug] = patch ? { ...entry, ...patch } : entry;
  }
  return merged;
}

const catalogOverrides = collectOverrides(catalogRaw as readonly OverrideCarrier[]);

/** The snapshot with `catalog.json`'s `bggOverrides` applied. */
export const bggSnapshot: BggSnapshot = applyCatalogOverrides(rawBggSnapshot, catalogOverrides);

export function getBggBySlug(slug: string): BggGame | null {
  return bggSnapshot[slug] ?? null;
}

export function getBggByBggId(id: number): BggGame | null {
  // 0 is the sentinel for games not on BGG (homebrew variants like
  // chess-bughouse, elements-of-truth) — multiple slugs share it, so reverse
  // lookup is undefined.
  if (id === 0) return null;
  for (const entry of Object.values(bggSnapshot)) {
    if (entry.id === id) return entry;
  }
  return null;
}

/** Numeric upper bound for filter math. `"infinity"` and `null` both map to
 *  `Number.POSITIVE_INFINITY` so that "any headcount fits" is the safe
 *  default — callers that need to distinguish "unknown" from "unbounded"
 *  should branch on the raw field. */
export function maxPlayersAsNumber(max: BggGame["maxPlayers"]): number {
  if (max === null || max === "infinity") return Number.POSITIVE_INFINITY;
  return max;
}

/** Human label for the upper bound. `null` returns `null` so the caller can
 *  decide between "?" and skipping; `"infinity"` returns the ∞ symbol. */
export function formatMaxPlayers(max: BggGame["maxPlayers"]): string | null {
  if (max === null) return null;
  if (max === "infinity") return "∞";
  return String(max);
}
