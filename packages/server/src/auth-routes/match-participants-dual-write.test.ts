// Proves the `match_participants` index stays in lockstep with `match_results`
// on every write path, and that the per-user read it enables pages correctly.
//
// The record/edit/delete SQL below is a copy of admin-match-history.ts's, kept
// in lockstep with it; the participant statements and the read query are the
// real helpers from lib/match-participants.ts.

import type { MatchOutcome } from "@boardgames/core/history/types";
import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  matchIdOf,
  matchIdOfClientId,
  newestMatchId,
  participantSyncStatements,
  userMatchesQuery,
} from "../lib/match-participants.ts";
import { runMigrations } from "../migrations/migrator.ts";

const INSERT = `INSERT INTO match_results
    (date_key, played_at, game_slug, game_title, outcome_json, notes, recorded_by, recorded_at, sort_order, client_id)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'),
          COALESCE((SELECT MIN(sort_order) - 1 FROM match_results WHERE date_key IS ?), 0), ?)
  ON CONFLICT(client_id) WHERE client_id IS NOT NULL DO NOTHING
  RETURNING id`;

const UPDATE = `UPDATE match_results
  SET date_key = ?, played_at = ?, game_slug = ?, game_title = ?,
      outcome_json = ?, notes = ?, updated_at = datetime('now'), sort_order = sort_order
  WHERE id = ?`;

const p = (id: string) => ({ userId: id, displayName: id.toUpperCase() });

function ffa(...ids: string[]): MatchOutcome {
  return {
    kind: "free-for-all",
    players: ids.map((id, i) => ({ ...p(id), score: 10 - i })),
  };
}

async function recordMatch(
  db: Client,
  options: { outcome: MatchOutcome; playedAt?: string; clientId?: string | null },
): Promise<number> {
  const { outcome, playedAt = "2026-01-01T18:00:00.000Z", clientId = null } = options;
  const [inserted] = await db.batch(
    [
      {
        sql: INSERT,
        args: [
          null,
          playedAt,
          "chess",
          "Chess",
          JSON.stringify(outcome),
          null,
          "u1",
          null,
          clientId,
        ],
      },
      ...participantSyncStatements(
        clientId === null ? newestMatchId() : matchIdOfClientId(clientId),
        outcome,
      ),
    ],
    "write",
  );
  return inserted.rows[0] ? Number(inserted.rows[0].id) : -1;
}

async function editMatch(db: Client, id: number, outcome: MatchOutcome): Promise<void> {
  await db.batch(
    [
      {
        sql: UPDATE,
        args: [
          null,
          "2026-01-01T18:00:00.000Z",
          "chess",
          "Chess",
          JSON.stringify(outcome),
          null,
          id,
        ],
      },
      ...participantSyncStatements(matchIdOf(id), outcome, { replace: true }),
    ],
    "write",
  );
}

async function participantsOf(db: Client, matchId: number): Promise<string[]> {
  const { rows } = await db.execute({
    sql: "SELECT user_id FROM match_participants WHERE match_id = ? ORDER BY user_id",
    args: [matchId],
  });
  return rows.map((r) => String(r.user_id));
}

async function matchIdsFor(db: Client, userId: string, limit?: number): Promise<number[]> {
  const { rows } = await db.execute(userMatchesQuery({ userId, limit }));
  return rows.map((r) => Number(r.id));
}

describe("match_participants dual-write", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await db.execute("PRAGMA foreign_keys = ON");
    await runMigrations(db);
    await db.batch(
      ["u1", "u2", "u3", "u10"].map((id) => ({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01')`,
        args: [id, id.toUpperCase(), `${id}@example.com`],
      })),
      "write",
    );
  });

  afterEach(() => {
    db.close();
  });

  it("indexes the participants of a newly recorded match", async () => {
    const id = await recordMatch(db, { outcome: ffa("u1", "u2") });
    expect(await participantsOf(db, id)).toEqual(["u1", "u2"]);
  });

  it("indexes against the right row when several matches are recorded in a row", async () => {
    const first = await recordMatch(db, { outcome: ffa("u1", "u2") });
    const second = await recordMatch(db, { outcome: ffa("u2", "u3") });
    expect(await participantsOf(db, first)).toEqual(["u1", "u2"]);
    expect(await participantsOf(db, second)).toEqual(["u2", "u3"]);
  });

  it("indexes a client_id submit once, and a retry re-syncs the same row", async () => {
    const id = await recordMatch(db, { outcome: ffa("u1", "u2"), clientId: "submit-abc" });
    const retry = await recordMatch(db, { outcome: ffa("u1", "u2"), clientId: "submit-abc" });
    expect(retry).toBe(-1); // DO NOTHING — no RETURNING row
    expect(await participantsOf(db, id)).toEqual(["u1", "u2"]);
    const { rows } = await db.execute("SELECT COUNT(*) AS n FROM match_participants");
    expect(Number(rows[0].n)).toBe(2);
  });

  it("adds and drops participants when an edit changes the outcome", async () => {
    const id = await recordMatch(db, { outcome: ffa("u1", "u2") });
    await editMatch(db, id, ffa("u2", "u3"));
    expect(await participantsOf(db, id)).toEqual(["u2", "u3"]);
    expect(await matchIdsFor(db, "u1")).toEqual([]);
    expect(await matchIdsFor(db, "u3")).toEqual([id]);
  });

  it("switches outcome kind on edit without leaving stale rows", async () => {
    const id = await recordMatch(db, { outcome: ffa("u1", "u2") });
    await editMatch(db, id, {
      kind: "coop",
      participants: [p("u2"), p("u3")],
      outcome: "loss",
      moderator: p("u10"),
    });
    expect(await participantsOf(db, id)).toEqual(["u10", "u2", "u3"]);
  });

  it("drops the index rows when the match is deleted", async () => {
    const id = await recordMatch(db, { outcome: ffa("u1", "u2") });
    await db.batch(
      [
        { sql: "DELETE FROM match_participants WHERE match_id = ?", args: [id] },
        { sql: "DELETE FROM match_results WHERE id = ?", args: [id] },
      ],
      "write",
    );
    expect(await participantsOf(db, id)).toEqual([]);
  });
});

describe("profile match pagination over match_participants", () => {
  let db: Client;
  const PAGE = 3;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await db.execute("PRAGMA foreign_keys = ON");
    await runMigrations(db);
    await db.batch(
      ["u1", "u2", "u10"].map((id) => ({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01')`,
        args: [id, id.toUpperCase(), `${id}@example.com`],
      })),
      "write",
    );
    // Every other match belongs to u10 only. Under the old
    // `outcome_json LIKE '%"userId":"u1"%'` filter these over-matched (u10
    // contains u1), were counted against the LIMIT, then dropped in JS — so a
    // page of 3 came back short and `nextBefore` jumped past unseen matches.
    for (let i = 0; i < 14; i += 1) {
      const day = String(10 + i).padStart(2, "0");
      await recordMatch(db, {
        outcome: ffa(i % 2 === 0 ? "u1" : "u10", "u2"),
        playedAt: `2026-01-${day}T18:00:00.000Z`,
      });
    }
  });

  afterEach(() => {
    db.close();
  });

  it("returns full pages and walks every match exactly once", async () => {
    const all = await matchIdsFor(db, "u1");
    expect(all).toHaveLength(7);

    const seen: number[] = [];
    let before: string | undefined;
    for (;;) {
      const { rows } = await db.execute(
        userMatchesQuery({ userId: "u1", before, limit: PAGE + 1 }),
      );
      const hasMore = rows.length > PAGE;
      const page = hasMore ? rows.slice(0, PAGE) : rows;
      if (hasMore) expect(page).toHaveLength(PAGE);
      seen.push(...page.map((r) => Number(r.id)));
      if (!hasMore || page.length === 0) break;
      before = String(page[page.length - 1].played_at);
    }
    expect(seen).toEqual(all);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it("never returns a match the user only appears to be in by substring", async () => {
    const u1 = await matchIdsFor(db, "u1");
    const u10 = await matchIdsFor(db, "u10");
    expect(u1.some((id) => u10.includes(id))).toBe(false);
    expect(u10).toHaveLength(7);
  });
});
