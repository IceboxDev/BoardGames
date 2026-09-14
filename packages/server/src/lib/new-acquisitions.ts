// "New in the library", for many members at once — the per-user New frame on
// the profile grid and the night picker. One rule, derived in one place:
// a dated `collection_items` row that isn't played through, with no recorded
// match of the game by that member on or after the date (`isNewAcquisition`).
// Recording the match clears it; nothing is stored.
//
// Callers intersect the result with the member's CURRENT inventory: a
// `collection_items` row outlives the copy it described (history), so a dated
// row alone doesn't mean the game is on the shelf.

import type { Client } from "@libsql/client";
import { z } from "zod";
import { parseRows } from "./db-rows.ts";
import { isNewAcquisition } from "./new-acquisition.ts";

const NewCandidateRowSchema = z.object({
  user_id: z.string(),
  slug: z.string(),
  acquired_on: z.string(),
  last_played_at: z.string().nullable(),
});

/** `userId → slugs new to that member` (members with none are absent). */
export async function fetchNewSlugsByUser(
  db: Client,
  userIds: readonly string[],
): Promise<Map<string, Set<string>>> {
  const byUser = new Map<string, Set<string>>();
  if (userIds.length === 0) return byUser;
  const placeholders = userIds.map(() => "?").join(",");
  const { rows } = await db.execute({
    sql: `SELECT ci.user_id, ci.slug, ci.acquired_on,
                 (SELECT MAX(m.played_at)
                    FROM match_results m
                    JOIN match_participants p ON p.match_id = m.id
                   WHERE p.user_id = ci.user_id AND m.game_slug = ci.slug) AS last_played_at
            FROM collection_items ci
           WHERE ci.user_id IN (${placeholders})
             AND ci.slug IS NOT NULL
             AND ci.acquired_on IS NOT NULL
             AND ci.played_through_at IS NULL`,
    args: [...userIds],
  });
  for (const row of parseRows(NewCandidateRowSchema, rows, "collection_items")) {
    if (!isNewAcquisition(row.acquired_on, row.last_played_at)) continue;
    let set = byUser.get(row.user_id);
    if (!set) {
      set = new Set();
      byUser.set(row.user_id, set);
    }
    set.add(row.slug);
  }
  return byUser;
}

/** One member's new slugs, restricted to what they currently own. */
export async function fetchNewSlugs(
  db: Client,
  userId: string,
  owned: ReadonlySet<string>,
): Promise<string[]> {
  const byUser = await fetchNewSlugsByUser(db, [userId]);
  return [...(byUser.get(userId) ?? [])].filter((slug) => owned.has(slug)).sort();
}
