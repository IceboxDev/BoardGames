// Baseline rotation, against a real migrated database.
//
// The rotation used to be decided in JS from a row read in an earlier round
// trip: read the state, decide rotate-vs-reset, write it back. That is a lost
// update — a boot-time engine heal (which resets the baseline on purpose)
// overlapping an admin recompute could land second and blank the "before"
// picture the spotlight diff needs, and the symptom ("recompute found nothing
// to announce") is indistinguishable from nobody having moved.
//
// It now happens inside the upsert. That correctness rests on one SQLite
// guarantee — that `SET col = table.other_col` in an UPSERT's DO UPDATE reads
// the row's PRE-update value — so the first test pins exactly that, and the
// rest exercise the real service through it.

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { ensureSkillState, forceSkillRecompute, skillRatingStatus } = await import(
  "./skill-ratings.ts"
);

const QUIET = { info() {}, warn() {} };

async function migrated(): Promise<Client> {
  const client = createClient({ url: ":memory:" });
  await client.execute("PRAGMA foreign_keys = ON");
  await runMigrations(client, { logger: QUIET });
  return client;
}

async function addUser(client: Client, id: string): Promise<void> {
  await client.execute({
    sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", guest, internal)
          VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', 0, 0)`,
    args: [id, id.toUpperCase(), `${id}@example.com`],
  });
}

/** One two-player free-for-all, `winner` first. */
async function addMatch(
  client: Client,
  opts: { playedAt: string; slug: string; winner: string; loser: string },
): Promise<void> {
  const outcome = {
    kind: "free-for-all",
    players: [
      { userId: opts.winner, displayName: opts.winner.toUpperCase(), score: 10, rank: 1 },
      { userId: opts.loser, displayName: opts.loser.toUpperCase(), score: 5, rank: 2 },
    ],
  };
  await client.execute({
    sql: `INSERT INTO match_results
            (date_key, played_at, game_slug, game_title, outcome_json, recorded_by, recorded_at)
          VALUES (NULL, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [opts.playedAt, opts.slug, opts.slug, JSON.stringify(outcome), opts.winner],
  });
}

async function stateRow(client: Client) {
  const { rows } = await client.execute(
    `SELECT payload_json, prev_payload_json, computed_at, prev_computed_at,
            config_version, prev_config_version
       FROM skill_rating_state WHERE id = 1`,
  );
  return rows[0] ?? null;
}

describe("UPSERT rotation reads pre-update values", () => {
  let client: Client;

  beforeEach(async () => {
    client = createClient({ url: ":memory:" });
    await client.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, cur TEXT, prev TEXT)");
  });

  afterEach(() => client.close());

  // The whole atomic-rotation design depends on this. If SQLite ever evaluated
  // SET expressions against partially-updated state, `prev` below would come
  // back as "second" instead of "first" and the baseline would be silently
  // self-referential.
  it("assigns the old value to prev while assigning the new value to cur", async () => {
    const upsert = `INSERT INTO t (id, cur, prev) VALUES (1, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET
                      prev = t.cur,
                      cur = excluded.cur`;
    await client.execute({ sql: upsert, args: ["first", "first"] });
    await client.execute({ sql: upsert, args: ["second", "second"] });

    const { rows } = await client.execute("SELECT cur, prev FROM t WHERE id = 1");
    expect(rows[0]).toMatchObject({ cur: "second", prev: "first" });
  });

  it("honours a CASE guard that also reads the pre-update row", async () => {
    await client.execute("INSERT INTO t (id, cur, prev) VALUES (1, 'first', 'first')");
    await client.execute({
      sql: `INSERT INTO t (id, cur, prev) VALUES (1, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              prev = CASE WHEN t.cur = 'first' THEN t.cur ELSE excluded.prev END,
              cur = excluded.cur`,
      args: ["second", "reset-marker"],
    });
    expect((await client.execute("SELECT prev FROM t WHERE id = 1")).rows[0]).toMatchObject({
      prev: "first",
    });
  });
});

describe("skill-rating baseline rotation", () => {
  beforeEach(async () => {
    db.current = await migrated();
    for (const id of ["alice", "bob"]) await addUser(db.current, id);
  });

  afterEach(() => {
    db.current?.close();
    db.current = null;
  });

  it("makes the replaced state the baseline on an admin recompute", async () => {
    const client = db.current as Client;
    await addMatch(client, {
      playedAt: "2026-01-01T18:00:00.000Z",
      slug: "chess",
      winner: "alice",
      loser: "bob",
    });
    const first = await forceSkillRecompute();
    expect(first).not.toBeNull();
    const afterFirst = await stateRow(client);
    const firstPayload = String(afterFirst?.payload_json);
    // A fresh insert has nothing to rotate: it is its own baseline.
    expect(afterFirst?.prev_payload_json).toBe(firstPayload);

    // A new night lands, then the admin recomputes.
    await addMatch(client, {
      playedAt: "2026-02-01T18:00:00.000Z",
      slug: "catan",
      winner: "bob",
      loser: "alice",
    });
    await forceSkillRecompute();

    const afterSecond = await stateRow(client);
    expect(String(afterSecond?.payload_json)).not.toBe(firstPayload);
    // The point: the baseline is exactly what the current state replaced.
    expect(String(afterSecond?.prev_payload_json)).toBe(firstPayload);
    expect(afterSecond?.prev_computed_at).toBe(afterFirst?.computed_at);
    expect(afterSecond?.prev_config_version).toBe(afterFirst?.config_version);
  });

  it("exposes that baseline to the admin status read", async () => {
    const client = db.current as Client;
    await addMatch(client, {
      playedAt: "2026-01-01T18:00:00.000Z",
      slug: "chess",
      winner: "alice",
      loser: "bob",
    });
    await forceSkillRecompute();
    await addMatch(client, {
      playedAt: "2026-02-01T18:00:00.000Z",
      slug: "catan",
      winner: "bob",
      loser: "alice",
    });
    await forceSkillRecompute();

    const status = await skillRatingStatus();
    expect(status.baseline).not.toBeNull();
    expect(status.baselineComputedAt).not.toBeNull();
    expect(status.matchesTotal).toBe(2);
    expect(status.stale).toBe(false);
  });

  it("reports data drift without acting on it", async () => {
    const client = db.current as Client;
    await addMatch(client, {
      playedAt: "2026-01-01T18:00:00.000Z",
      slug: "chess",
      winner: "alice",
      loser: "bob",
    });
    await forceSkillRecompute();
    const before = await stateRow(client);

    await addMatch(client, {
      playedAt: "2026-02-01T18:00:00.000Z",
      slug: "catan",
      winner: "bob",
      loser: "alice",
    });

    // `stale` is the load-bearing signal — it compares input fingerprints, so
    // it is exact. (`matchesChangedSince` is a display count built on a strict
    // `>` over SQLite's second-resolution timestamps, so a match recorded in
    // the same second as the last run doesn't register. Not asserted here
    // because a test writes both within microseconds.)
    const status = await skillRatingStatus();
    expect(status.stale).toBe(true);
    expect(status.matchesTotal).toBe(2);
    // A read must NOT heal a history change — the ratings stay put until an
    // admin runs one.
    await ensureSkillState();
    expect(String((await stateRow(client))?.payload_json)).toBe(String(before?.payload_json));
  });

  it("resets rather than rotates when the engine heals, so a config bump is never blamed on a player", async () => {
    const client = db.current as Client;
    await addMatch(client, {
      playedAt: "2026-01-01T18:00:00.000Z",
      slug: "chess",
      winner: "alice",
      loser: "bob",
    });
    await forceSkillRecompute();

    // Simulate the engine moving underneath the stored numbers.
    await client.execute("UPDATE skill_rating_state SET engine_fingerprint = 'stale' WHERE id = 1");
    await ensureSkillState();

    const healed = await stateRow(client);
    // Its own baseline — a heal has no honest "before" to offer.
    expect(String(healed?.prev_payload_json)).toBe(String(healed?.payload_json));
    expect((await skillRatingStatus()).baseline).toEqual((await skillRatingStatus()).state);
  });

  it("does not rotate across a config-version change", async () => {
    const client = db.current as Client;
    await addMatch(client, {
      playedAt: "2026-01-01T18:00:00.000Z",
      slug: "chess",
      winner: "alice",
      loser: "bob",
    });
    await forceSkillRecompute();
    // Pretend the stored row came from a different engine generation.
    await client.execute("UPDATE skill_rating_state SET config_version = 1 WHERE id = 1");

    await addMatch(client, {
      playedAt: "2026-02-01T18:00:00.000Z",
      slug: "catan",
      winner: "bob",
      loser: "alice",
    });
    await forceSkillRecompute();

    const row = await stateRow(client);
    // The guard fired: the new state is its own baseline instead of being
    // diffed against numbers a different model produced.
    expect(String(row?.prev_payload_json)).toBe(String(row?.payload_json));
  });
});
