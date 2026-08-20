// Greetings — the celebratory takeover pop-ups.
//
// Two kinds share one queue so exactly one can ever be pending and the client
// never has to arbitrate: the one-time "skill profiles are live" intro, and
// spotlights (group news about one member's best move since the previous
// rating run).
//
// A spotlight is published by an admin, not by the system: `spotlightCandidates`
// ranks what moved, the admin reads the ranking, and only then does a row land
// in `skill_greetings`. Once published it is immutable — the payload carries
// its own proof board, so later recomputes can't rewrite what a card claimed.
//
// "Seen" is a high-water mark (`user_profiles.greeting_seen_id`), not a
// per-greeting join: a newer spotlight outranks an older unseen one, so someone
// who was away for three of them comes back to the current news rather than a
// backlog.

import { type Greeting, GreetingSchema, SpotlightPayloadSchema } from "@boardgames/core/protocol";
import { z } from "zod";
import { getDb } from "../db.ts";
import { jsonColumn, parseRow, parseRows } from "./db-rows.ts";
import { type StoredSkillState, skillRatingStatus } from "./skill-ratings.ts";
import { candidatesFor, payloadFor } from "./spotlight-payload.ts";

const GreetingRowSchema = z.object({
  id: z.number(),
  created_at: z.string(),
  subject_user_id: z.string(),
  payload_json: jsonColumn(SpotlightPayloadSchema),
});
export type GreetingRow = z.infer<typeof GreetingRowSchema>;

const GREETING_COLUMNS = "id, created_at, subject_user_id, payload_json";

/** Publish one candidate. Returns null when the key is no longer on offer. */
export async function publishSpotlight(candidateKey: string): Promise<GreetingRow | null> {
  const status = await skillRatingStatus();
  if (!status.state) return null;
  const built = payloadFor(status.state, candidatesFor(status), candidateKey);
  if (!built) return null;
  const { rows } = await getDb().execute({
    sql: `INSERT INTO skill_greetings (created_at, subject_user_id, payload_json)
          VALUES (datetime('now'), ?, ?)
          RETURNING ${GREETING_COLUMNS}`,
    args: [built.subjectUserId, JSON.stringify(built.payload)],
  });
  return parseRow(GreetingRowSchema, rows[0], "skill_greetings.insert");
}

/** The spotlight currently on show, or null once retracted or never published. */
export async function latestGreeting(): Promise<GreetingRow | null> {
  const { rows } = await getDb().execute(
    `SELECT ${GREETING_COLUMNS} FROM skill_greetings
     WHERE retracted_at IS NULL ORDER BY id DESC LIMIT 1`,
  );
  return rows.length > 0 ? parseRow(GreetingRowSchema, rows[0], "skill_greetings.latest") : null;
}

/** Pull a published spotlight. Already-dismissed members are unaffected. */
export async function retractGreeting(id: number): Promise<boolean> {
  const result = await getDb().execute({
    sql: "UPDATE skill_greetings SET retracted_at = datetime('now') WHERE id = ? AND retracted_at IS NULL",
    args: [id],
  });
  return result.rowsAffected > 0;
}

/** How many members have dismissed a given greeting. */
export async function seenCount(id: number): Promise<number> {
  const { rows } = await getDb().execute({
    sql: "SELECT COUNT(*) AS n FROM user_profiles WHERE greeting_seen_id >= ?",
    args: [id],
  });
  return parseRow(z.object({ n: z.number() }), rows[0], "user_profiles.greeting-seen").n;
}

const ViewerRowSchema = z.object({
  skill_intro_seen_at: z.string().nullable(),
  greeting_seen_id: z.number().nullable(),
});

/**
 * The one greeting this viewer should see next, or null.
 *
 * The intro outranks a spotlight on purpose: being told what a Planning leader
 * IS has to come before being told who the new one is. Spotlights are group
 * news, so they go to every member — including one who isn't ranked yet, for
 * whom this is the clearest picture of what there is to play toward.
 */
export async function nextGreetingFor(
  viewerId: string,
  state: StoredSkillState | null,
): Promise<Greeting | null> {
  const db = getDb();
  const [profile, latest] = await Promise.all([
    db.execute({
      sql: "SELECT skill_intro_seen_at, greeting_seen_id FROM user_profiles WHERE user_id = ? LIMIT 1",
      args: [viewerId],
    }),
    latestGreeting(),
  ]);
  const seen =
    profile.rows.length > 0
      ? parseRows(ViewerRowSchema, profile.rows, "user_profiles.greeting")[0]
      : { skill_intro_seen_at: null, greeting_seen_id: null };

  const highlight = state?.players[viewerId]?.highlights[0];
  if (seen.skill_intro_seen_at === null && highlight) {
    return GreetingSchema.parse({ kind: "skill-intro", highlight });
  }
  if (latest && (seen.greeting_seen_id ?? 0) < latest.id) {
    return GreetingSchema.parse({
      kind: "spotlight",
      id: latest.id,
      subjectUserId: latest.subject_user_id,
      payload: latest.payload_json,
    });
  }
  return null;
}
