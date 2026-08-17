// Pins the SQL contract of POST /api/admin/calendar/night-guest
// (calendar-locks.ts): adding a guest upserts an RSVP "yes" (flipping any
// prior "no" and resetting auto), and removing deletes the row outright —
// no tombstone "no". Runs the real migration chain against an in-memory DB
// with foreign keys ON (prod parity). Statements kept in lockstep with the
// route.

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../migrations/migrator.ts";

const UPSERT_YES = `INSERT INTO rsvps (date_key, user_id, status, rsvped_at, auto)
      VALUES (?, ?, 'yes', datetime('now'), 0)
      ON CONFLICT(date_key, user_id) DO UPDATE SET
        status = 'yes',
        rsvped_at = excluded.rsvped_at,
        auto = 0`;

const DELETE_RSVP = "DELETE FROM rsvps WHERE date_key = ? AND user_id = ?";

const DATE = "2026-09-01";
const GUEST = "guest-1";

describe("admin night-guest SQL contract", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await db.execute("PRAGMA foreign_keys = ON");
    await runMigrations(db);
    await db.execute({
      sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", guest)
            VALUES (?, 'Plus One', 'plus.one@guest.local', 0, '2020-01-01', '2020-01-01', 1)`,
      args: [GUEST],
    });
    await db.execute({
      sql: `INSERT INTO locked_dates (date_key, locked_by, expected_user_ids_json)
            VALUES (?, 'admin-1', '[]')`,
      args: [DATE],
    });
  });

  afterEach(() => {
    db.close();
  });

  async function rsvpRow() {
    const { rows } = await db.execute({
      sql: "SELECT status, auto FROM rsvps WHERE date_key = ? AND user_id = ?",
      args: [DATE, GUEST],
    });
    return rows[0] ?? null;
  }

  it("adds a guest as a manual RSVP yes", async () => {
    await db.execute({ sql: UPSERT_YES, args: [DATE, GUEST] });
    expect(await rsvpRow()).toMatchObject({ status: "yes", auto: 0 });
  });

  it("flips a prior kick ('no') back to yes and resets auto", async () => {
    await db.execute({
      sql: "INSERT INTO rsvps (date_key, user_id, status, auto) VALUES (?, ?, 'no', 1)",
      args: [DATE, GUEST],
    });
    await db.execute({ sql: UPSERT_YES, args: [DATE, GUEST] });
    expect(await rsvpRow()).toMatchObject({ status: "yes", auto: 0 });
  });

  it("removal deletes the row instead of leaving a tombstone 'no'", async () => {
    await db.execute({ sql: UPSERT_YES, args: [DATE, GUEST] });
    await db.execute({ sql: DELETE_RSVP, args: [DATE, GUEST] });
    expect(await rsvpRow()).toBeNull();
  });
});
