// The progress carried across by migration 0061 must land on the facts and
// articles the converter gave the same legacy ids (`quiz/ids.ts`).

import { factIdFromLegacy } from "@boardgames/core/quiz/ids";
import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrations } from "./registry.ts";

async function apply(db: Client, from: number, to: number) {
  for (const m of migrations) {
    if (m.version >= from && m.version <= to) await db.batch([...m.statements], "write");
  }
}

describe("migration 0061 — quiz platform", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await db.execute("PRAGMA foreign_keys = ON");
    await apply(db, 1, 60);
    await db.execute(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ('u1', 'U', 'u@example.com', 1, '2026-01-01', '2026-01-01')`,
    );
  });
  afterEach(() => db.close());

  it("maps schedule, reviews, settings, reads and reports by formula", async () => {
    await db.execute(
      `INSERT INTO quiztopia_srs (user_id, question_id, category, state, ease, interval_days, due_date, reps, lapses)
       VALUES ('u1', 'c042-s07-q3', 7, 'review', 2.6, 4, '2026-10-01', 3, 0)`,
    );
    await db.execute(
      `INSERT INTO quiztopia_reviews (user_id, client_id, question_id, category, grade, prev_state, source, local_date, room_code)
       VALUES ('u1', 'game:g:1', 'c001-s01-q0', 1, 'good', 'new', 'game', '2026-10-01', 'ABCD')`,
    );
    await db.execute(
      "INSERT INTO quiztopia_settings (user_id, language, new_per_day) VALUES ('u1', 'de', 10)",
    );
    await db.execute(
      "INSERT INTO quiztopia_wiki_reads (user_id, set_id, read_at) VALUES ('u1', 'c002-s01', 'x')",
    );
    await db.execute(
      `INSERT INTO quiztopia_reports (user_id, target_kind, target_id, set_id, category, issue, language, surface, content_version, snapshot_json, created_at, updated_at)
       VALUES ('u1', 'question', 'c177-s12-q4', 'c177-s12', 12, 'typo', 'en', 'trainer', 'v', '{}', 'x', 'x')`,
    );
    await apply(db, 61, 61);

    const srs = await db.execute("SELECT deck, card_id, state, interval_days FROM trainer_srs");
    expect(srs.rows.map((r) => ({ ...r }))).toEqual([
      { deck: "quiz", card_id: factIdFromLegacy("c042-s07-q3"), state: "review", interval_days: 4 },
    ]);
    const rev = await db.execute("SELECT card_id, source, outcome_json FROM trainer_reviews");
    expect({ ...rev.rows[0] }).toEqual({
      card_id: "f00001",
      source: "game",
      outcome_json: '{"roomCode":"ABCD"}',
    });
    const settings = await db.execute("SELECT deck, settings_json FROM trainer_settings");
    expect({ ...settings.rows[0] }).toEqual({ deck: "quiz", settings_json: '{"language":"de"}' });
    const reads = await db.execute("SELECT article_id FROM quiz_wiki_reads");
    expect(reads.rows[0]?.article_id).toBe("a0013");
    const reports = await db.execute("SELECT target_id FROM quiz_reports");
    expect(reports.rows[0]?.target_id).toBe("f10620");
    const left = await db.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'quiztopia_%'",
    );
    expect(left.rows).toEqual([]);
  });
});
