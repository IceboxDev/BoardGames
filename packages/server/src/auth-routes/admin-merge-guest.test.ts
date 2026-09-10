// Merging a guest must move everything the guest earned onto the target and
// leave no dangling reference behind — in particular the RSVP rows and the
// sealed guest lists that `POST /night-guest` creates, which the old merge
// let ON DELETE CASCADE erase. The last test reads the live schema so a new
// foreign key onto `user` cannot be added without being classified.
//
// Real migration chain, in-memory libsql, the real route behind an admin stub.

import { type Client, createClient } from "@libsql/client";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminEnv } from "../auth/types.ts";
import { countNightsAttended } from "../lib/nights-attended.ts";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { adminMergeGuestRoutes, GUEST_MERGE_COVERAGE } = await import("./admin-merge-guest.ts");

const ADMIN = "admin-1";
const GUEST = "guest-1";
const TARGET = "member-1";
const OTHER = "member-2";
const NIGHT_A = "2026-08-01"; // guest RSVP'd, no match recorded
const NIGHT_B = "2026-08-08"; // guest played a match
const QUIET = { info() {}, warn() {} };

function app() {
  const a = new Hono<AdminEnv>();
  a.use("*", async (c, next) => {
    c.set("user", { id: ADMIN, role: "admin" } as AdminEnv["Variables"]["user"]);
    await next();
  });
  a.route("/api/admin/users", adminMergeGuestRoutes);
  return a;
}

function merge(a: Hono<AdminEnv>, guestUserId: string, targetUserId: string) {
  return a.request("/api/admin/users/merge-guest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ guestUserId, targetUserId }),
  });
}

async function addUser(client: Client, id: string, opts: { guest?: boolean; role?: string } = {}) {
  await client.execute({
    sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", guest, role)
          VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', ?, ?)`,
    args: [id, id, `${id}@example.com`, opts.guest ? 1 : 0, opts.role ?? "user"],
  });
}

async function recordMatch(client: Client, dateKey: string, winner: string, loser: string) {
  const outcome = {
    kind: "free-for-all",
    players: [
      { userId: winner, displayName: winner, score: 10, rank: 1 },
      { userId: loser, displayName: loser, score: 5, rank: 2 },
    ],
  };
  const { rows } = await client.execute({
    sql: `INSERT INTO match_results
            (date_key, played_at, game_slug, game_title, outcome_json, recorded_by)
          VALUES (?, '2026-08-08T18:00:00.000Z', 'chess', 'Chess', ?, ?) RETURNING id`,
    args: [dateKey, JSON.stringify(outcome), ADMIN],
  });
  const id = Number(rows[0]?.id);
  await client.batch(
    [winner, loser].map((userId) => ({
      sql: "INSERT INTO match_participants (match_id, user_id) VALUES (?, ?)",
      args: [id, userId],
    })),
    "write",
  );
  return id;
}

describe("POST /api/admin/users/merge-guest", () => {
  let client: Client;

  async function rsvps(userId: string) {
    const { rows } = await client.execute({
      sql: "SELECT date_key, status, auto FROM rsvps WHERE user_id = ? ORDER BY date_key",
      args: [userId],
    });
    return rows.map((r) => ({ date: String(r.date_key), status: String(r.status), auto: r.auto }));
  }

  async function guestList(table: string, dateKey: string): Promise<string[]> {
    const { rows } = await client.execute({
      sql: `SELECT expected_user_ids_json FROM ${table} WHERE date_key = ?`,
      args: [dateKey],
    });
    return JSON.parse(String(rows[0]?.expected_user_ids_json)) as string[];
  }

  async function nightsAttended(userId: string): Promise<number> {
    const yes = await client.execute({
      sql: "SELECT date_key FROM rsvps WHERE user_id = ? AND status = 'yes'",
      args: [userId],
    });
    const withMatches = await client.execute(
      "SELECT DISTINCT date_key FROM match_results WHERE date_key IS NOT NULL",
    );
    const played = await client.execute({
      sql: `SELECT DISTINCT m.date_key FROM match_results m
            JOIN match_participants p ON p.match_id = m.id WHERE p.user_id = ?`,
      args: [userId],
    });
    return countNightsAttended({
      pastNights: [NIGHT_A, NIGHT_B],
      rsvpYesNights: new Set(yes.rows.map((r) => String(r.date_key))),
      nightsWithMatches: new Set(withMatches.rows.map((r) => String(r.date_key))),
      playedNights: new Set(played.rows.map((r) => String(r.date_key))),
    });
  }

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("PRAGMA foreign_keys = ON");
    await runMigrations(client, { logger: QUIET });
    db.current = client;
    await addUser(client, ADMIN, { role: "admin" });
    await addUser(client, TARGET);
    await addUser(client, OTHER);
    await addUser(client, GUEST, { guest: true });
    for (const night of [NIGHT_A, NIGHT_B]) {
      await client.execute({
        sql: `INSERT INTO locked_dates (date_key, locked_by, expected_user_ids_json, picks_locked_at)
              VALUES (?, ?, ?, datetime('now'))`,
        args: [night, ADMIN, JSON.stringify([OTHER, GUEST])],
      });
    }
    // Night A: the guest was brought along and never played a recorded match.
    await client.execute({
      sql: "INSERT INTO rsvps (date_key, user_id, status, auto) VALUES (?, ?, 'yes', 0)",
      args: [NIGHT_A, GUEST],
    });
    // Night B: the guest played; the target had an automatic 'no' that night.
    await client.execute({
      sql: "INSERT INTO rsvps (date_key, user_id, status, auto) VALUES (?, ?, 'yes', 0)",
      args: [NIGHT_B, GUEST],
    });
    await client.execute({
      sql: "INSERT INTO rsvps (date_key, user_id, status, auto) VALUES (?, ?, 'no', 1)",
      args: [NIGHT_B, TARGET],
    });
    await recordMatch(client, NIGHT_B, GUEST, OTHER);
    await client.execute({
      sql: `INSERT INTO calendar_unlocked_tombstones (date_key, expected_user_ids_json)
            VALUES ('2026-07-25', ?)`,
      args: [JSON.stringify([GUEST])],
    });
  });

  afterEach(() => {
    client.close();
    db.current = null;
  });

  it("moves attendance, votes and guest-list membership onto the target and deletes the guest", async () => {
    expect(await nightsAttended(TARGET)).toBe(0);
    expect(await nightsAttended(GUEST)).toBe(2);

    const res = await merge(app(), GUEST, TARGET);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, matchesUpdated: 1 });

    // The guest row is gone and nothing points at it any more.
    const { rows: users } = await client.execute({
      sql: `SELECT 1 FROM "user" WHERE id = ?`,
      args: [GUEST],
    });
    expect(users).toEqual([]);
    expect(await rsvps(GUEST)).toEqual([]);

    // RSVPs moved; the target's automatic 'no' yielded to the guest's explicit 'yes'.
    expect(await rsvps(TARGET)).toEqual([
      { date: NIGHT_A, status: "yes", auto: 0 },
      { date: NIGHT_B, status: "yes", auto: 0 },
    ]);
    // Both nights are credited: one via RSVP (no match), one via the match.
    expect(await nightsAttended(TARGET)).toBe(2);

    // Sealed guest lists name the target now, order kept, no dangling id.
    expect(await guestList("locked_dates", NIGHT_A)).toEqual([OTHER, TARGET]);
    expect(await guestList("locked_dates", NIGHT_B)).toEqual([OTHER, TARGET]);
    expect(await guestList("calendar_unlocked_tombstones", "2026-07-25")).toEqual([TARGET]);

    // The match outcome and its index name the target.
    const { rows: matches } = await client.execute("SELECT outcome_json FROM match_results");
    expect(String(matches[0]?.outcome_json)).toContain(TARGET);
    expect(String(matches[0]?.outcome_json)).not.toContain(GUEST);
    const { rows: participants } = await client.execute(
      "SELECT user_id FROM match_participants ORDER BY user_id",
    );
    expect(participants.map((r) => r.user_id)).toEqual([TARGET, OTHER].sort());
  });

  it("collapses a duplicate when the target was already on the guest list", async () => {
    await client.execute({
      sql: "UPDATE locked_dates SET expected_user_ids_json = ? WHERE date_key = ?",
      args: [JSON.stringify([TARGET, OTHER, GUEST]), NIGHT_A],
    });
    expect((await merge(app(), GUEST, TARGET)).status).toBe(200);
    expect(await guestList("locked_dates", NIGHT_A)).toEqual([TARGET, OTHER]);
  });

  it("keeps the target's explicit RSVP when both answered", async () => {
    await client.execute({
      sql: "UPDATE rsvps SET status = 'no', auto = 0 WHERE date_key = ? AND user_id = ?",
      args: [NIGHT_B, TARGET],
    });
    expect((await merge(app(), GUEST, TARGET)).status).toBe(200);
    expect(await rsvps(TARGET)).toEqual([
      { date: NIGHT_A, status: "yes", auto: 0 },
      { date: NIGHT_B, status: "no", auto: 0 },
    ]);
  });

  it("refuses to delete the guest when a match it does not know about still names it", async () => {
    // A participant-index row whose outcome the rewrite will not touch:
    // the shape a match recorded between the route's read and its batch
    // leaves behind (the guest is indexed, but our read never saw it).
    const id = await recordMatch(client, NIGHT_B, OTHER, ADMIN);
    await client.execute({
      sql: "INSERT INTO match_participants (match_id, user_id) VALUES (?, ?)",
      args: [id, GUEST],
    });

    const res = await merge(app(), GUEST, TARGET);
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "MERGE_CONFLICT" });
    // The guest survived; the transfers that did run are idempotent and the
    // history it earned is intact for the retry.
    const { rows: users } = await client.execute({
      sql: `SELECT 1 FROM "user" WHERE id = ?`,
      args: [GUEST],
    });
    expect(users.length).toBe(1);
    expect(await rsvps(TARGET)).toHaveLength(2);
  });

  it("re-points an arrival the guest bought, and its seen-mark, at the target", async () => {
    const { rows } = await client.execute(
      `INSERT INTO purchase_polls (candidate_slugs_json, required_voters, closed_at, winner_slug)
       VALUES ('["azul"]', 1, datetime('now'), 'azul') RETURNING id`,
    );
    const pollId = Number(rows[0]?.id);
    await client.execute({
      sql: "INSERT INTO purchase_arrivals (id, poll_id, published_by) VALUES ('arr-1', ?, ?)",
      args: [pollId, ADMIN],
    });
    await client.execute({
      sql: `INSERT INTO purchase_arrival_games
              (arrival_id, slug, position, purchaser_user_id, photo, photo_placeholder,
               photo_w, photo_h, photo_bytes)
            VALUES ('arr-1', 'azul', 0, ?, 'data:image/webp;base64,AA==', 'data:image/webp;base64,AA==', 1280, 1600, 1)`,
      args: [GUEST],
    });
    await client.execute({
      sql: "INSERT INTO purchase_arrival_seen (arrival_id, user_id) VALUES ('arr-1', ?)",
      args: [GUEST],
    });

    expect((await merge(app(), GUEST, TARGET)).status).toBe(200);
    const { rows: games } = await client.execute(
      "SELECT purchaser_user_id FROM purchase_arrival_games WHERE arrival_id = 'arr-1'",
    );
    expect(games.map((g) => g.purchaser_user_id)).toEqual([TARGET]);
    const { rows: seen } = await client.execute(
      "SELECT user_id FROM purchase_arrival_seen WHERE arrival_id = 'arr-1'",
    );
    expect(seen.map((s) => s.user_id)).toEqual([TARGET]);
  });

  it("classifies every foreign key onto user in the live schema", async () => {
    const { rows: tables } = await client.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
    );
    const live = new Set<string>();
    for (const t of tables) {
      const table = String(t.name);
      const { rows: fks } = await client.execute(`PRAGMA foreign_key_list("${table}")`);
      for (const fk of fks) {
        if (String(fk.table) === "user") live.add(`${table}.${String(fk.from)}`);
      }
    }
    const classified = new Set<string>([
      ...GUEST_MERGE_COVERAGE.transferred,
      ...GUEST_MERGE_COVERAGE.droppedByDesign,
    ]);
    const unclassified = [...live].filter((ref) => !classified.has(ref)).sort();
    expect(
      unclassified,
      "a table gained a foreign key onto user; add it to GUEST_MERGE_COVERAGE (transfer it or justify the cascade)",
    ).toEqual([]);
    const stale = [...classified].filter((ref) => !live.has(ref)).sort();
    expect(stale, "GUEST_MERGE_COVERAGE names a reference the schema no longer has").toEqual([]);
  });
});
