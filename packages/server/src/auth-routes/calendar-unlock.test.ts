// Unlocking a night must not destroy it (migration 0035).
//
// It used to run three deletes, and the last one cascaded through
// `rsvps`, `game_requests` and `exit_game_votes`. One admin click erased who
// had committed to a night and every vote cast for it — permanently, with
// attendance statistics silently rewritten behind it and no way back, because
// re-locking had nothing left to restore.
//
// These tests pin both halves of the replacement: an unlocked night is exactly
// as invisible as a deleted one was (so nothing downstream changed), and its
// data is still there afterwards (so re-locking brings the night back whole).
//
// Runs the real migration chain against an in-memory DB with foreign keys ON,
// and keeps the SQL in lockstep with `calendar-locks.ts`.

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../migrations/migrator.ts";

const QUIET = { info() {}, warn() {} };

const DATE = "2026-03-07";
const ADMIN = "admin-1";
const MEMBER = "member-1";

/** The unlock batch, in lockstep with `DELETE /api/admin/calendar/lock`. */
const TOMBSTONE = `INSERT OR REPLACE INTO calendar_unlocked_tombstones
    (date_key, expected_user_ids_json, host_user_id, host_name,
     event_time, address, unlocked_at)
  SELECT date_key, expected_user_ids_json, host_user_id, host_name,
         event_time, address, datetime('now')
  FROM locked_dates WHERE date_key = ? AND unlocked_at IS NULL`;
const MARK_UNLOCKED = `UPDATE locked_dates SET unlocked_at = datetime('now')
  WHERE date_key = ? AND unlocked_at IS NULL`;

/** The revive half of `POST /lock`'s upsert. */
const RELOCK = `INSERT INTO locked_dates
    (date_key, locked_by, locked_at, expected_user_ids_json)
  VALUES (?, ?, datetime('now'), ?)
  ON CONFLICT(date_key) DO UPDATE SET
    locked_by = excluded.locked_by,
    locked_at = excluded.locked_at,
    expected_user_ids_json = excluded.expected_user_ids_json,
    unlocked_at = NULL`;

async function count(db: Client, sql: string, args: unknown[] = []): Promise<number> {
  const { rows } = await db.execute({ sql, args: args as never[] });
  return Number(rows[0]?.n ?? 0);
}

async function unlock(db: Client): Promise<void> {
  await db.batch(
    [
      { sql: TOMBSTONE, args: [DATE] },
      { sql: MARK_UNLOCKED, args: [DATE] },
    ],
    "write",
  );
}

describe("unlocking a night (migration 0035)", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await db.execute("PRAGMA foreign_keys = ON");
    await runMigrations(db, { logger: QUIET });

    for (const id of [ADMIN, MEMBER]) {
      await db.execute({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01')`,
        args: [id, id, `${id}@example.com`],
      });
    }
    await db.execute({
      sql: `INSERT INTO locked_dates (date_key, locked_by, expected_user_ids_json, host_user_id)
            VALUES (?, ?, ?, ?)`,
      args: [DATE, ADMIN, JSON.stringify([MEMBER]), ADMIN],
    });
    await db.execute({
      sql: "INSERT INTO rsvps (date_key, user_id, status) VALUES (?, ?, 'yes')",
      args: [DATE, MEMBER],
    });
    await db.execute({
      sql: `INSERT INTO game_requests (date_key, user_id, game_slug, reaction)
            VALUES (?, ?, 'wingspan', 'hype')`,
      args: [DATE, MEMBER],
    });
    await db.execute({
      sql: `INSERT INTO exit_game_votes (date_key, user_id, exit_slug)
            VALUES (?, ?, 'exit-the-abandoned-cabin')`,
      args: [DATE, MEMBER],
    });
  });

  afterEach(() => db.close());

  it("keeps the rsvps, game votes and exit votes it used to cascade away", async () => {
    await unlock(db);

    expect(await count(db, "SELECT COUNT(*) n FROM rsvps WHERE date_key = ?", [DATE])).toBe(1);
    expect(await count(db, "SELECT COUNT(*) n FROM game_requests WHERE date_key = ?", [DATE])).toBe(
      1,
    );
    expect(
      await count(db, "SELECT COUNT(*) n FROM exit_game_votes WHERE date_key = ?", [DATE]),
    ).toBe(1);
    // And the night row itself survives, carrying the mark.
    const { rows } = await db.execute({
      sql: "SELECT unlocked_at FROM locked_dates WHERE date_key = ?",
      args: [DATE],
    });
    expect(rows[0]?.unlocked_at).not.toBeNull();
  });

  it("still writes the tombstone the iCalendar CANCELLED event needs", async () => {
    await unlock(db);
    expect(
      await count(db, "SELECT COUNT(*) n FROM calendar_unlocked_tombstones WHERE date_key = ?", [
        DATE,
      ]),
    ).toBe(1);
  });

  // Every read that means "is this night on?" filters `unlocked_at IS NULL`.
  // If one is ever missed, an unlocked night reappears on that surface — so
  // each live query shape gets an assertion here.
  describe("is invisible to every active-night read", () => {
    beforeEach(() => unlock(db));

    it("the calendar lock list", async () => {
      expect(await count(db, "SELECT COUNT(*) n FROM locked_dates WHERE unlocked_at IS NULL")).toBe(
        0,
      );
    });

    it("the next-night lookup", async () => {
      expect(
        await count(
          db,
          "SELECT COUNT(*) n FROM locked_dates WHERE date_key >= '2000-01-01' AND unlocked_at IS NULL",
        ),
      ).toBe(0);
    });

    it("the past-nights denominator behind nights-attended", async () => {
      expect(
        await count(
          db,
          "SELECT COUNT(*) n FROM locked_dates WHERE date_key < '2099-01-01' AND unlocked_at IS NULL",
        ),
      ).toBe(0);
    });

    it("the host-stats aggregate", async () => {
      expect(
        await count(
          db,
          "SELECT COUNT(*) n FROM locked_dates WHERE host_user_id IS NOT NULL AND unlocked_at IS NULL",
        ),
      ).toBe(0);
    });

    it("the rsvp→availability merge, so no ghost 'can' comes back", async () => {
      expect(
        await count(
          db,
          `SELECT COUNT(*) n FROM rsvps r WHERE r.status = 'yes'
             AND EXISTS (SELECT 1 FROM locked_dates l
                         WHERE l.date_key = r.date_key AND l.unlocked_at IS NULL)`,
        ),
      ).toBe(0);
    });

    it("the iCalendar feed's locked-date enumeration", async () => {
      expect(
        await count(
          db,
          `SELECT COUNT(*) n FROM locked_dates ld
            WHERE ld.date_key >= '2000-01-01' AND ld.date_key < '2099-01-01'
              AND ld.unlocked_at IS NULL`,
        ),
      ).toBe(0);
    });
  });

  it("comes back whole when re-locked", async () => {
    await unlock(db);
    await db.execute({ sql: RELOCK, args: [DATE, ADMIN, JSON.stringify([MEMBER])] });

    expect(await count(db, "SELECT COUNT(*) n FROM locked_dates WHERE unlocked_at IS NULL")).toBe(
      1,
    );
    // The evidence a member was coming, and what they voted for, is intact —
    // this is precisely what the old cascade made impossible.
    expect(
      await count(
        db,
        `SELECT COUNT(*) n FROM rsvps r WHERE r.user_id = ? AND r.status = 'yes'
           AND EXISTS (SELECT 1 FROM locked_dates l
                       WHERE l.date_key = r.date_key AND l.unlocked_at IS NULL)`,
        [MEMBER],
      ),
    ).toBe(1);
    expect(await count(db, "SELECT COUNT(*) n FROM game_requests WHERE date_key = ?", [DATE])).toBe(
      1,
    );
    expect(
      await count(db, "SELECT COUNT(*) n FROM exit_game_votes WHERE date_key = ?", [DATE]),
    ).toBe(1);
  });

  it("is idempotent — a second unlock does not move the timestamp", async () => {
    await unlock(db);
    const first = (
      await db.execute({
        sql: "SELECT unlocked_at FROM locked_dates WHERE date_key = ?",
        args: [DATE],
      })
    ).rows[0]?.unlocked_at;

    await unlock(db);
    const second = (
      await db.execute({
        sql: "SELECT unlocked_at FROM locked_dates WHERE date_key = ?",
        args: [DATE],
      })
    ).rows[0]?.unlocked_at;

    expect(second).toBe(first);
  });

  it("leaves a match recorded against the night pointing at a row that still exists", async () => {
    await db.execute({
      sql: `INSERT INTO match_results
              (date_key, played_at, game_slug, game_title, outcome_json, recorded_by, recorded_at)
            VALUES (?, '2026-03-07T19:00:00.000Z', 'wingspan', 'Wingspan', '{}', ?, datetime('now'))`,
      args: [DATE, ADMIN],
    });
    await unlock(db);

    // `match_results.date_key` has no FK, so the old hard delete left this
    // dangling with nothing to detect it.
    expect(
      await count(
        db,
        `SELECT COUNT(*) n FROM match_results m
          WHERE m.date_key IS NOT NULL
            AND NOT EXISTS (SELECT 1 FROM locked_dates l WHERE l.date_key = m.date_key)`,
      ),
    ).toBe(0);
  });
});
