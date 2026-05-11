import type { BggGame, BggSnapshot } from "../protocol/http/bgg.ts";
import snapshotJson from "./snapshot.json";

export type { BggGame, BggSnapshot };

export const bggSnapshot: BggSnapshot = snapshotJson as BggSnapshot;

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
