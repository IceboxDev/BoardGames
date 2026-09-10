// Arrivals — the data layer behind the "games are here" takeover.
//
// An arrival is immutable once published (retract = hard delete, republish
// = new id), which is what lets `arrivalPhotoPath` double as a forever cache
// key. The photo column is only ever read by `arrivalPhoto`; every other
// reader projects the metadata columns, so listing arrivals never drags
// megabytes of base64 through the row parser.

import { type ArrivalGreeting, ArrivalGreetingSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import { getDb } from "../db.ts";
import { dataUriToBuffer } from "./data-uri.ts";
import { parseRow, parseRows } from "./db-rows.ts";
import { computeTally, distinctVoterCount, pollById, pollVotes } from "./purchase-vote.ts";
import { playerRefs } from "./user-refs.ts";

/** A member who has been away longer than this never sees an old arrival —
 * their collection page already shows the game. */
export const ARRIVAL_GREETING_WINDOW_DAYS = 60;

export const ArrivalRowSchema = z.object({
  id: z.string(),
  poll_id: z.number(),
  published_at: z.string(),
  published_by: z.string().nullable(),
});
export type ArrivalRow = z.infer<typeof ArrivalRowSchema>;

/** Never `photo` — see the header. */
export const ArrivalGameRowSchema = z.object({
  arrival_id: z.string(),
  slug: z.string(),
  position: z.number(),
  purchaser_user_id: z.string(),
  photo_placeholder: z.string(),
  photo_w: z.number(),
  photo_h: z.number(),
  photo_bytes: z.number(),
});
export type ArrivalGameRow = z.infer<typeof ArrivalGameRowSchema>;

export type ArrivalWithGames = { arrival: ArrivalRow; games: ArrivalGameRow[] };

const ARRIVAL_COLUMNS = "id, poll_id, published_at, published_by";
const GAME_COLUMNS =
  "arrival_id, slug, position, purchaser_user_id, photo_placeholder, photo_w, photo_h, photo_bytes";

export function arrivalPhotoPath(arrivalId: string, slug: string): string {
  return `/api/arrivals/${encodeURIComponent(arrivalId)}/photos/${encodeURIComponent(slug)}`;
}

async function gamesByArrival(
  arrivalIds: readonly string[],
): Promise<Map<string, ArrivalGameRow[]>> {
  const out = new Map<string, ArrivalGameRow[]>();
  if (arrivalIds.length === 0) return out;
  const { rows } = await getDb().execute({
    sql: `SELECT ${GAME_COLUMNS} FROM purchase_arrival_games
           WHERE arrival_id IN (${arrivalIds.map(() => "?").join(",")})
           ORDER BY arrival_id, position`,
    args: [...arrivalIds],
  });
  for (const row of parseRows(ArrivalGameRowSchema, rows, "purchase_arrival_games")) {
    const list = out.get(row.arrival_id);
    if (list) list.push(row);
    else out.set(row.arrival_id, [row]);
  }
  return out;
}

async function withGames(arrivals: ArrivalRow[]): Promise<ArrivalWithGames[]> {
  const games = await gamesByArrival(arrivals.map((a) => a.id));
  // An arrival whose every purchaser was deleted has cascaded to nothing
  // worth showing — skip it rather than serve an empty takeover.
  return arrivals
    .map((arrival) => ({ arrival, games: games.get(arrival.id) ?? [] }))
    .filter((a) => a.games.length > 0);
}

/** Every arrival with at least one game, newest first. */
export async function listArrivals(): Promise<ArrivalWithGames[]> {
  const { rows } = await getDb().execute(
    `SELECT ${ARRIVAL_COLUMNS} FROM purchase_arrivals ORDER BY published_at DESC, rowid DESC`,
  );
  return withGames(parseRows(ArrivalRowSchema, rows, "purchase_arrivals"));
}

/** Candidate slugs of `pollId` that some arrival has already announced. */
export async function arrivedSlugsForPoll(pollId: number): Promise<Set<string>> {
  const { rows } = await getDb().execute({
    sql: `SELECT g.slug FROM purchase_arrival_games g
           JOIN purchase_arrivals a ON a.id = g.arrival_id
          WHERE a.poll_id = ?`,
    args: [pollId],
  });
  return new Set(rows.map((r) => String(r.slug)));
}

/** The arrival this viewer owes a look at: the OLDEST unseen one inside the
 * freshness window — each arrival is distinct news, unlike spotlights' one
 * high-water mark. */
export async function nextUnseenArrival(viewerId: string): Promise<ArrivalWithGames | null> {
  const { rows } = await getDb().execute({
    sql: `SELECT ${ARRIVAL_COLUMNS} FROM purchase_arrivals a
           WHERE a.published_at > datetime('now', ?)
             AND NOT EXISTS (SELECT 1 FROM purchase_arrival_seen s
                              WHERE s.arrival_id = a.id AND s.user_id = ?)
             AND EXISTS (SELECT 1 FROM purchase_arrival_games g WHERE g.arrival_id = a.id)
           ORDER BY a.published_at ASC, a.rowid ASC
           LIMIT 1`,
    args: [`-${ARRIVAL_GREETING_WINDOW_DAYS} days`, viewerId],
  });
  if (rows.length === 0) return null;
  const arrival = parseRow(ArrivalRowSchema, rows[0], "purchase_arrivals.next");
  return (await withGames([arrival]))[0] ?? null;
}

/** Idempotent, and a no-op for an arrival that has since been retracted. */
export async function markArrivalSeen(arrivalId: string, userId: string): Promise<void> {
  await getDb().execute({
    sql: `INSERT OR IGNORE INTO purchase_arrival_seen (arrival_id, user_id)
          SELECT ?, ? WHERE EXISTS (SELECT 1 FROM purchase_arrivals WHERE id = ?)`,
    args: [arrivalId, userId, arrivalId],
  });
}

/** Members who dismissed or followed each arrival's takeover. */
export async function arrivalSeenCounts(
  arrivalIds: readonly string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (arrivalIds.length === 0) return out;
  const { rows } = await getDb().execute({
    sql: `SELECT arrival_id, COUNT(*) AS n FROM purchase_arrival_seen
           WHERE arrival_id IN (${arrivalIds.map(() => "?").join(",")})
           GROUP BY arrival_id`,
    args: [...arrivalIds],
  });
  for (const r of rows) out.set(String(r.arrival_id), Number(r.n));
  return out;
}

/** The stored photo bytes, or null when no such game/arrival exists. */
export async function arrivalPhoto(arrivalId: string, slug: string): Promise<Buffer | null> {
  const { rows } = await getDb().execute({
    sql: "SELECT photo FROM purchase_arrival_games WHERE arrival_id = ? AND slug = ? LIMIT 1",
    args: [arrivalId, slug],
  });
  const photo = rows[0]?.photo;
  return typeof photo === "string" ? dataUriToBuffer(photo) : null;
}

/**
 * The member-facing payload. Voters come out as faces only — the strict
 * `ArrivalVoterFaceSchema` inside `ArrivalGreetingSchema.parse` turns any
 * leaked id or name into a thrown error here, not a privacy incident there.
 */
export async function buildArrivalGreeting(
  arrival: ArrivalRow,
  games: readonly ArrivalGameRow[],
): Promise<ArrivalGreeting> {
  const poll = await pollById(arrival.poll_id);
  if (!poll) throw new Error(`arrival ${arrival.id} references a missing poll`);
  const votes = await pollVotes(poll.id);
  const tally = new Map(
    computeTally(poll.candidate_slugs_json, votes).map((entry) => [entry.slug, entry] as const),
  );

  const ids = new Set<string>();
  for (const game of games) {
    ids.add(game.purchaser_user_id);
    for (const voterId of tally.get(game.slug)?.voterIds ?? []) ids.add(voterId);
  }
  const refs = await playerRefs(ids);

  return ArrivalGreetingSchema.parse({
    kind: "arrival",
    arrivalId: arrival.id,
    pollId: poll.id,
    publishedAt: arrival.published_at,
    games: games.map((game) => {
      const entry = tally.get(game.slug);
      const purchaser = refs[game.purchaser_user_id];
      return {
        slug: game.slug,
        purchaser: {
          id: game.purchaser_user_id,
          name: purchaser?.name ?? "A member",
          image: purchaser?.image ?? null,
          accentHex: purchaser?.accentHex ?? null,
        },
        votes: entry?.votes ?? 0,
        voters: (entry?.voterIds ?? []).map((id) => ({
          image: refs[id]?.image ?? null,
          accentHex: refs[id]?.accentHex ?? null,
        })),
        photoUrl: arrivalPhotoPath(arrival.id, game.slug),
        placeholder: game.photo_placeholder,
        width: game.photo_w,
        height: game.photo_h,
      };
    }),
    totals: { voterCount: distinctVoterCount(votes), votesCast: votes.length },
  });
}
