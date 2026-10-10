// Onboarding state per member (`user_onboarding`, migration 0051): the
// welcome tour's answer and the first-use hints dismissed.
//
//   - No row = a member who joined after onboarding shipped: the tour is due.
//   - `existingMember` (the migration's backfill) = never shown on its own.
//   - The tour is answered once ("finished" / "skipped", first answer wins);
//     only then do hints become due, so the two never compete.
//
// Writes are single statements built on SQLite's JSON functions, so a hint
// dismissed in one tab and the tour answered in another can't overwrite
// each other (no read-modify-write in JavaScript).

import {
  HINT_IDS,
  type HintId,
  type OnboardingDeckOutcome,
  type OnboardingState,
  parseOnboardingState,
} from "@boardgames/core/protocol";
import type { Client } from "@libsql/client";
import { z } from "zod";
import { parseRows } from "./db-rows.ts";

const RowSchema = z.object({ state_json: z.string() });

/** The member's state, or null when they have no row (a new member). */
export async function readOnboarding(db: Client, userId: string): Promise<OnboardingState | null> {
  const { rows } = await db.execute({
    sql: "SELECT state_json FROM user_onboarding WHERE user_id = ?",
    args: [userId],
  });
  const row = parseRows(RowSchema, rows, "user_onboarding")[0];
  if (!row) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(row.state_json);
  } catch {
    raw = null;
  }
  return parseOnboardingState(raw);
}

/** The welcome tour is due: a new member who hasn't answered it yet. */
export function deckDue(state: OnboardingState | null): boolean {
  return !state?.existingMember && !state?.deck;
}

/** Hints still to show, in order — none before the tour is answered. */
export function hintsDue(state: OnboardingState | null): HintId[] {
  if (!state || state.existingMember || !state.deck) return [];
  return HINT_IDS.filter((id) => !state.hints[id]);
}

/** Record the tour's answer. First answer wins; later ones change nothing. */
export async function answerDeck(
  db: Client,
  userId: string,
  outcome: OnboardingDeckOutcome,
  reached: number,
  now: Date = new Date(),
): Promise<void> {
  const deck = JSON.stringify({ outcome, at: now.toISOString(), reached });
  await db.execute({
    sql: `INSERT INTO user_onboarding (user_id, state_json, updated_at)
          VALUES (?, json_object('hints', json_object(), 'deck', json(?)), datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            state_json = json_set(user_onboarding.state_json, '$.deck', json(?)),
            updated_at = datetime('now')
          WHERE json_extract(user_onboarding.state_json, '$.deck') IS NULL`,
    args: [userId, deck, deck],
  });
}

/** Record a hint as dismissed (idempotent: the first time is kept). */
export async function markHintSeen(
  db: Client,
  userId: string,
  id: HintId,
  now: Date = new Date(),
): Promise<void> {
  const at = now.toISOString();
  // A JSON path with the id quoted: hint ids contain dashes.
  const path = `$.hints."${id}"`;
  await db.execute({
    sql: `INSERT INTO user_onboarding (user_id, state_json, updated_at)
          VALUES (?, json_object('hints', json_object(?, ?)), datetime('now'))
          ON CONFLICT(user_id) DO UPDATE SET
            state_json = json_set(
              CASE WHEN json_type(user_onboarding.state_json, '$.hints') IS NULL
                   THEN json_set(user_onboarding.state_json, '$.hints', json_object())
                   ELSE user_onboarding.state_json END,
              ?, ?),
            updated_at = datetime('now')
          WHERE json_extract(user_onboarding.state_json, ?) IS NULL`,
    args: [userId, id, at, path, at, path],
  });
}
