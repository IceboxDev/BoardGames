// Progress on a removed duplicate fact lands on the fact it duplicated.

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { migrations } from "./registry.ts";

async function apply(db: Client, from: number, to: number) {
  for (const m of migrations) {
    if (m.version >= from && m.version <= to) await db.batch([...m.statements], "write");
  }
}

describe("migration 0063 — quiz fact redirects", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await db.execute("PRAGMA foreign_keys = ON");
    await apply(db, 1, 62);
    await db.execute(
      `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
       VALUES ('u1', 'U', 'u@example.com', 1, '2026-01-01', '2026-01-01')`,
    );
  });
  afterEach(() => db.close());

  const srs = (card: string, interval: number) =>
    db.execute({
      sql: `INSERT INTO trainer_srs (user_id, deck, card_id, state, interval_days, due_date)
            VALUES ('u1', 'quiz', ?, 'review', ?, '2026-10-01')`,
      args: [card, interval],
    });

  it("moves schedules, reviews and reports; the further-along schedule wins", async () => {
    // f07445 → f06062 (kept has no schedule); f03032 → f00003 (kept already scheduled).
    await srs("f07445", 9);
    await srs("f03032", 4);
    await srs("f00003", 2);
    // f06067 → f00006: the kept fact's schedule is further along and stays.
    await srs("f06067", 1);
    await srs("f00006", 5);
    await srs("f00001", 1);
    await db.execute(
      `INSERT INTO trainer_reviews (user_id, deck, client_id, card_id, grade, prev_state, source, local_date)
       VALUES ('u1', 'quiz', 'c1', 'f07445', 'good', 'new', 'trainer', '2026-10-01')`,
    );
    await db.execute(
      `INSERT INTO quiz_reports (user_id, target_kind, target_id, issue, language, surface, content_version, snapshot_json, created_at, updated_at)
       VALUES ('u1', 'question', 'f03032', 'typo', 'en', 'trainer', 'v', '{}', 'x', 'x')`,
    );
    await apply(db, 63, 63);

    const rows = await db.execute(
      "SELECT card_id, interval_days FROM trainer_srs WHERE deck = 'quiz' ORDER BY card_id",
    );
    expect(rows.rows.map((r) => [r.card_id, r.interval_days])).toEqual([
      ["f00001", 1],
      ["f00003", 4],
      ["f00006", 5],
      ["f06062", 9],
    ]);
    const rev = await db.execute("SELECT card_id FROM trainer_reviews");
    expect(rev.rows[0]?.card_id).toBe("f06062");
    const rep = await db.execute("SELECT target_id FROM quiz_reports");
    expect(rep.rows[0]?.target_id).toBe("f00003");
    const left = await db.execute(
      "SELECT name FROM sqlite_master WHERE name = 'quiz_fact_redirects_0063'",
    );
    expect(left.rows).toEqual([]);
  });
});
