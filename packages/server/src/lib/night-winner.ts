// A locked night's vote winner without the per-date games payload: the same
// lineup rule (`rankNightLineup` over the games a definite attendee owns that
// fit the headcount window, minus the picker's exclusions while it votes), so
// `/locks`' `topGameSlug` and the admin's outstanding overview always name
// the payload's `topSlugs[0]`.

import { isNightGame } from "@boardgames/core/games/catalog";
import { expandOwnedSlugs } from "@boardgames/core/games/ownership";
import { SlugListSchema } from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { computePlayableSlugs, rankNightLineup } from "./available-games.ts";
import { jsonColumn, parseRow, RowParseError } from "./db-rows.ts";
import { type NightLock, type NightParticipants, sealedAt } from "./night-participants.ts";
import {
  nightPickerExclusions,
  type PickerFilterInputs,
  withoutExcluded,
} from "./night-picker-filters.ts";

/** `SELECT user_id, game_slugs_json FROM user_inventory`. */
const InventoryRowSchema = z.object({
  user_id: z.string(),
  game_slugs_json: jsonColumn(SlugListSchema),
});

/**
 * user_id → the night games they own (expansions and card decks unfolded).
 * One row per member, so the whole table is cheap; a corrupt row is skipped
 * rather than hiding everyone's shelves.
 */
export async function loadNightGameInventories(db: Client): Promise<Map<string, Set<string>>> {
  const { rows } = await db.execute("SELECT user_id, game_slugs_json FROM user_inventory");
  const out = new Map<string, Set<string>>();
  for (const row of rows) {
    let inv: z.infer<typeof InventoryRowSchema>;
    try {
      inv = parseRow(InventoryRowSchema, row, "user_inventory");
    } catch (err) {
      if (!(err instanceof RowParseError)) throw err;
      continue;
    }
    out.set(
      inv.user_id,
      new Set([...expandOwnedSlugs(new Set(inv.game_slugs_json))].filter(isNightGame)),
    );
  }
  return out;
}

export type NightReactionRow = {
  user_id: string;
  game_slug: string;
  reaction: "hype" | "teach" | "learn";
  created_at: string;
};

/** The games on offer tonight and the one leading the vote (or set in advance). */
export function nightLineupLeader(opts: {
  lock: NightLock;
  participants: NightParticipants;
  inventoryByUser: ReadonlyMap<string, ReadonlySet<string>>;
  pickerFilters: PickerFilterInputs;
  reactions: readonly NightReactionRow[];
}): { playableSlugs: Set<string>; topGameSlug: string | null } {
  const { lock, participants } = opts;
  const ownedUnion = new Set<string>();
  for (const id of participants.definite) {
    const inv = opts.inventoryByUser.get(id);
    if (inv) for (const slug of inv) ownedUnion.add(slug);
  }
  const { lo, hi } = participants.window;
  const playableSlugs = computePlayableSlugs(
    withoutExcluded(
      ownedUnion,
      nightPickerExclusions(opts.pickerFilters, {
        sealed: sealedAt(lock) !== null,
        peopleIds: [...participants.definite, ...participants.tentative],
      }),
    ),
    lo,
    hi,
  );
  const topGameSlug =
    lock.fixedGameSlug ??
    rankNightLineup(
      {
        pickMode: lock.pickMode,
        isPrivate: lock.isPrivate,
        hostUserId: lock.hostUserId,
        voters: participants.voters,
        playableSlugs,
      },
      opts.reactions,
      1,
    ).topSlugs[0] ??
    null;
  return { playableSlugs, topGameSlug };
}
