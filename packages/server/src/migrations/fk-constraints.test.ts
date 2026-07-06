// Behavioral proof of the domain foreign keys added in migrations 0011-0013:
// deleting a user cascades their owned rows and nulls their hosted nights,
// unlocking a date cascades its rsvps/votes, and orphan inserts are rejected.
// Runs the real migration chain on an in-memory DB with foreign keys ON.

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "./migrator.ts";

async function count(db: Client, sql: string): Promise<number> {
  const { rows } = await db.execute(sql);
  return Number(rows[0].n);
}

describe("domain foreign keys (migrations 0011-0013)", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await db.execute("PRAGMA foreign_keys = ON");
    await runMigrations(db);
    await db.batch(
      [
        `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
         VALUES ('u1', 'U1', 'u1@e.com', 0, '2020-01-01', '2020-01-01')`,
        `INSERT INTO locked_dates (date_key, locked_by, host_user_id) VALUES ('2026-02-01', 'u1', 'u1')`,
        `INSERT INTO rsvps (date_key, user_id, status) VALUES ('2026-02-01', 'u1', 'yes')`,
        `INSERT INTO game_requests (date_key, user_id, game_slug, reaction)
         VALUES ('2026-02-01', 'u1', 'chess', 'hype')`,
        `INSERT INTO user_inventory (user_id, game_slugs_json) VALUES ('u1', '[]')`,
        `INSERT INTO user_profiles (user_id) VALUES ('u1')`,
      ],
      "write",
    );
  });

  afterEach(() => {
    db.close();
  });

  it("cascades a user's rsvps, votes, inventory and profile on delete; nulls hosted nights", async () => {
    await db.execute("DELETE FROM \"user\" WHERE id = 'u1'");

    expect(await count(db, "SELECT COUNT(*) n FROM rsvps WHERE user_id = 'u1'")).toBe(0);
    expect(await count(db, "SELECT COUNT(*) n FROM game_requests WHERE user_id = 'u1'")).toBe(0);
    expect(await count(db, "SELECT COUNT(*) n FROM user_inventory WHERE user_id = 'u1'")).toBe(0);
    expect(await count(db, "SELECT COUNT(*) n FROM user_profiles WHERE user_id = 'u1'")).toBe(0);

    // The night survives, but its host reference is nulled (SET NULL).
    const lock = await db.execute(
      "SELECT host_user_id FROM locked_dates WHERE date_key = '2026-02-01'",
    );
    expect(lock.rows.length).toBe(1);
    expect(lock.rows[0].host_user_id).toBeNull();
  });

  it("cascades rsvps and votes when a locked date is deleted (unlock)", async () => {
    await db.execute("DELETE FROM locked_dates WHERE date_key = '2026-02-01'");
    expect(await count(db, "SELECT COUNT(*) n FROM rsvps WHERE date_key = '2026-02-01'")).toBe(0);
    expect(
      await count(db, "SELECT COUNT(*) n FROM game_requests WHERE date_key = '2026-02-01'"),
    ).toBe(0);
  });

  it("rejects an rsvp for a non-existent user", async () => {
    await expect(
      db.execute(
        "INSERT INTO rsvps (date_key, user_id, status) VALUES ('2026-02-01', 'ghost', 'yes')",
      ),
    ).rejects.toThrow();
  });

  it("rejects an rsvp for a non-existent date", async () => {
    await expect(
      db.execute(
        "INSERT INTO rsvps (date_key, user_id, status) VALUES ('2099-01-01', 'u1', 'yes')",
      ),
    ).rejects.toThrow();
  });
});
