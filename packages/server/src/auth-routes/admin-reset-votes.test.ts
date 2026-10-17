// Pins the SQL contract of POST /api/admin/calendar/reset-votes
// (calendar-locks.ts): every game vote cast for that one night goes (or one
// person's, with `userId`), and
// nothing else does — not the RSVPs, not the EXIT box vote, not the votes of
// another night (including the same day's second night, `<date>_2`). Runs the
// real migration chain against an in-memory DB with foreign keys ON. The
// statement is kept in lockstep with the route.

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../migrations/migrator.ts";

const QUIET = { info() {}, warn() {} };

const RESET = "DELETE FROM game_requests WHERE date_key = ?";
const RESET_ONE = "DELETE FROM game_requests WHERE date_key = ? AND user_id = ?";

const DATE = "2026-09-01";
const SECOND_NIGHT = "2026-09-01_2";
const OTHER_DATE = "2026-09-08";
const MEMBERS = ["member-1", "member-2"];

async function count(db: Client, sql: string, args: string[]): Promise<number> {
  const { rows } = await db.execute({ sql, args });
  return Number(rows[0]?.n ?? 0);
}

describe("admin reset-votes SQL contract", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await db.execute("PRAGMA foreign_keys = ON");
    await runMigrations(db, { logger: QUIET });
    for (const id of MEMBERS) {
      await db.execute({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01')`,
        args: [id, id, `${id}@example.com`],
      });
    }
    for (const date of [DATE, SECOND_NIGHT, OTHER_DATE]) {
      await db.execute({
        sql: `INSERT INTO locked_dates (date_key, locked_by, expected_user_ids_json)
              VALUES (?, 'member-1', '[]')`,
        args: [date],
      });
      for (const user of MEMBERS) {
        for (const reaction of ["hype", "teach"]) {
          await db.execute({
            sql: `INSERT INTO game_requests (date_key, user_id, game_slug, reaction)
                  VALUES (?, ?, 'wingspan', ?)`,
            args: [date, user, reaction],
          });
        }
      }
    }
    await db.execute({
      sql: "INSERT INTO rsvps (date_key, user_id, status) VALUES (?, 'member-1', 'yes')",
      args: [DATE],
    });
    await db.execute({
      sql: `INSERT INTO exit_game_votes (date_key, user_id, exit_slug)
            VALUES (?, 'member-1', 'exit-the-abandoned-cabin')`,
      args: [DATE],
    });
  });

  afterEach(() => db.close());

  it("clears every vote on the night and reports how many", async () => {
    const result = await db.execute({ sql: RESET, args: [DATE] });
    expect(result.rowsAffected).toBe(4);
    expect(await count(db, "SELECT COUNT(*) n FROM game_requests WHERE date_key = ?", [DATE])).toBe(
      0,
    );
  });

  it("leaves other nights' votes alone, including the same day's second night", async () => {
    await db.execute({ sql: RESET, args: [DATE] });
    for (const date of [SECOND_NIGHT, OTHER_DATE]) {
      expect(
        await count(db, "SELECT COUNT(*) n FROM game_requests WHERE date_key = ?", [date]),
      ).toBe(4);
    }
  });

  it("keeps the RSVPs and the EXIT box vote", async () => {
    await db.execute({ sql: RESET, args: [DATE] });
    expect(await count(db, "SELECT COUNT(*) n FROM rsvps WHERE date_key = ?", [DATE])).toBe(1);
    expect(
      await count(db, "SELECT COUNT(*) n FROM exit_game_votes WHERE date_key = ?", [DATE]),
    ).toBe(1);
  });

  it("resets one person's votes alone when a userId is given", async () => {
    const result = await db.execute({ sql: RESET_ONE, args: [DATE, "member-1"] });
    expect(result.rowsAffected).toBe(2);
    const left = (user: string, date: string) =>
      count(db, "SELECT COUNT(*) n FROM game_requests WHERE date_key = ? AND user_id = ?", [
        date,
        user,
      ]);
    expect(await left("member-1", DATE)).toBe(0);
    expect(await left("member-2", DATE)).toBe(2);
    expect(await left("member-1", SECOND_NIGHT)).toBe(2);
  });
});
