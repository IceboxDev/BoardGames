// Proves the DB-level idempotency contract added in migration 0009: a repeated
// record-match INSERT that reuses the same `client_id` records the match once,
// while a null client_id (older clients) always inserts. Runs the real
// migration chain against an in-memory DB with foreign keys ON (prod parity).

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../migrations/migrator.ts";

// The idempotent insert, kept in lockstep with admin-match-history.ts POST "/".
const INSERT = `INSERT INTO match_results
    (date_key, played_at, game_slug, game_title, outcome_json, notes, recorded_by, recorded_at, sort_order, client_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'),
          COALESCE((SELECT MIN(sort_order) - 1 FROM match_results WHERE date_key IS ?), 0), ?)
  ON CONFLICT(client_id) WHERE client_id IS NOT NULL DO NOTHING
  RETURNING id`;

function insertArgs(clientId: string | null) {
  // date_key null (standalone match) so this stays valid even after the Fix-4
  // FK on match_results.date_key -> locked_dates lands.
  return [
    "2026-01-01",
    "2026-01-01T18:00:00.000Z",
    "chess",
    "Chess",
    "{}",
    null,
    "u1",
    null,
    clientId,
  ];
}

describe("match_results idempotency (migration 0009)", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await db.execute("PRAGMA foreign_keys = ON");
    await runMigrations(db);
    // A real recorder row, so this survives the Fix-4 recorded_by FK.
    await db.execute({
      sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
            VALUES ('u1', 'U', 'u@example.com', 0, '2020-01-01', '2020-01-01')`,
    });
  });

  afterEach(() => {
    db.close();
  });

  it("records once for a repeated client_id and returns no row on the retry", async () => {
    const first = await db.execute({ sql: INSERT, args: insertArgs("submit-abc") });
    expect(first.rows.length).toBe(1);

    const retry = await db.execute({ sql: INSERT, args: insertArgs("submit-abc") });
    expect(retry.rows.length).toBe(0); // DO NOTHING

    const count = await db.execute(
      "SELECT COUNT(*) AS n FROM match_results WHERE client_id = 'submit-abc'",
    );
    expect(Number(count.rows[0].n)).toBe(1);
  });

  it("still inserts every time when client_id is null (older clients)", async () => {
    await db.execute({ sql: INSERT, args: insertArgs(null) });
    await db.execute({ sql: INSERT, args: insertArgs(null) });
    const count = await db.execute(
      "SELECT COUNT(*) AS n FROM match_results WHERE client_id IS NULL",
    );
    expect(Number(count.rows[0].n)).toBe(2);
  });

  it("keeps distinct client_ids as separate rows", async () => {
    await db.execute({ sql: INSERT, args: insertArgs("a") });
    await db.execute({ sql: INSERT, args: insertArgs("b") });
    const count = await db.execute("SELECT COUNT(*) AS n FROM match_results");
    expect(Number(count.rows[0].n)).toBe(2);
  });
});
