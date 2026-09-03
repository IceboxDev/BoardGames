// Purchase polls — "vote for the next game purchase".
//
// One poll at a time (enforced at the admin API: create is refused while one
// is open). Players toggle votes exactly like EXIT votes; distinctness is the
// composite PK and the 3-vote budget is a count check in the route. The poll
// seals itself the moment the required number of distinct voters is reached —
// `closePoll` is idempotent (`WHERE closed_at IS NULL`) so the auto-close
// racing an admin force-close resolves to one winner stamp.
//
// Tally order mirrors `rankTopSlugs`: votes desc, then slug asc — the winner
// is simply the top row with at least one vote.

import { z } from "zod";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow, parseRows } from "./db-rows.ts";

export const PollRowSchema = z.object({
  id: z.number(),
  created_at: z.string(),
  candidate_slugs_json: jsonColumn(z.array(z.string())),
  required_voters: z.number(),
  closed_at: z.string().nullable(),
  winner_slug: z.string().nullable(),
});
export type PollRow = z.infer<typeof PollRowSchema>;

const POLL_COLUMNS =
  "id, created_at, candidate_slugs_json, required_voters, closed_at, winner_slug";

const VoteRowSchema = z.object({ user_id: z.string(), slug: z.string() });
export type VoteRow = z.infer<typeof VoteRowSchema>;

const SeenRowSchema = z.object({
  first_seen_at: z.string().nullable(),
  result_seen_at: z.string().nullable(),
});
export type SeenRow = z.infer<typeof SeenRowSchema>;

/** The most recent poll, open or closed — the only one any surface shows. */
export async function latestPoll(): Promise<PollRow | null> {
  const { rows } = await getDb().execute(
    `SELECT ${POLL_COLUMNS} FROM purchase_polls ORDER BY id DESC LIMIT 1`,
  );
  return rows.length > 0 ? parseRow(PollRowSchema, rows[0], "purchase_polls.latest") : null;
}

export async function pollVotes(pollId: number): Promise<VoteRow[]> {
  const { rows } = await getDb().execute({
    sql: "SELECT user_id, slug FROM purchase_poll_votes WHERE poll_id = ?",
    args: [pollId],
  });
  return parseRows(VoteRowSchema, rows, "purchase_poll_votes");
}

export function distinctVoterCount(votes: readonly VoteRow[]): number {
  return new Set(votes.map((v) => v.user_id)).size;
}

/** Every candidate with its vote count, votes desc then slug asc. Votes on
 * slugs no longer in the candidate list (shouldn't happen) still count rows. */
export function computeTally(
  candidates: readonly string[],
  votes: readonly VoteRow[],
): { slug: string; votes: number }[] {
  const counts = new Map<string, number>(candidates.map((slug) => [slug, 0]));
  for (const v of votes) counts.set(v.slug, (counts.get(v.slug) ?? 0) + 1);
  return [...counts.entries()]
    .map(([slug, n]) => ({ slug, votes: n }))
    .sort((a, b) => b.votes - a.votes || a.slug.localeCompare(b.slug));
}

/** Top of the tally, or null when nobody voted at all. */
export function computeWinner(tally: readonly { slug: string; votes: number }[]): string | null {
  const top = tally[0];
  return top && top.votes > 0 ? top.slug : null;
}

/** Stamp `closed_at` + the winner. Idempotent: a second close is a no-op. */
export async function closePoll(poll: PollRow): Promise<void> {
  const winner = computeWinner(computeTally(poll.candidate_slugs_json, await pollVotes(poll.id)));
  await getDb().execute({
    sql: `UPDATE purchase_polls SET closed_at = datetime('now'), winner_slug = ?
          WHERE id = ? AND closed_at IS NULL`,
    args: [winner, poll.id],
  });
}

export async function pollSeen(pollId: number, userId: string): Promise<SeenRow> {
  const { rows } = await getDb().execute({
    sql: "SELECT first_seen_at, result_seen_at FROM purchase_poll_seen WHERE poll_id = ? AND user_id = ? LIMIT 1",
    args: [pollId, userId],
  });
  return rows.length > 0
    ? parseRow(SeenRowSchema, rows[0], "purchase_poll_seen")
    : { first_seen_at: null, result_seen_at: null };
}

/** Idempotent first-write-wins timestamp, same shape as the skill-intro ack. */
export async function markPollSeen(
  pollId: number,
  userId: string,
  field: "first_seen_at" | "result_seen_at",
): Promise<void> {
  await getDb().execute({
    sql: `INSERT INTO purchase_poll_seen (poll_id, user_id, ${field})
          VALUES (?, ?, datetime('now'))
          ON CONFLICT(poll_id, user_id) DO UPDATE SET
            ${field} = COALESCE(purchase_poll_seen.${field}, excluded.${field})`,
    args: [pollId, userId],
  });
}
