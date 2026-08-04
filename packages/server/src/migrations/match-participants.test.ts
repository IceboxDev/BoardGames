// Proves the contract of migration 0024: the `match_participants` backfill
// reproduces `extractParticipantIds` EXACTLY for every outcome kind — a missed
// kind would silently drop matches out of a member's history — and a deleted
// match or user takes its index rows with it.
//
// Seeds legacy-shaped rows on a fully migrated in-memory DB, then replays the
// migration's own statements against them (CREATE … IF NOT EXISTS and
// INSERT OR IGNORE make the replay a no-op for the parts already applied).

import { extractParticipantIds } from "@boardgames/core/history/participant-results";
import type { MatchOutcome } from "@boardgames/core/history/types";
import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { matchParticipants } from "./0024-match-participants.ts";
import { runMigrations } from "./migrator.ts";

const INSERT_MATCH = `INSERT INTO match_results
    (id, date_key, played_at, game_slug, game_title, outcome_json, recorded_by, recorded_at, sort_order)
  VALUES (?, NULL, '2026-01-01T18:00:00.000Z', ?, 'Game', ?, 'u1', datetime('now'), 0)`;

const p = (id: string) => ({ userId: id, displayName: id.toUpperCase() });

const OUTCOMES: Record<string, MatchOutcome> = {
  "free-for-all": {
    kind: "free-for-all",
    players: [
      { ...p("u1"), score: 10 },
      { ...p("u2"), score: 7 },
      { ...p("u3"), score: 3 },
    ],
  },
  "last-standing": {
    kind: "last-standing",
    players: [{ ...p("u2") }, { ...p("u4"), eliminationOrder: 1 }],
  },
  teams: {
    kind: "teams",
    teams: [{ members: [p("u1"), p("u5")] }, { members: [p("u2"), p("u3")] }],
    winnerTeamIndices: [0],
    moderator: p("u6"),
  },
  coop: {
    kind: "coop",
    participants: [p("u3"), p("u4")],
    outcome: "win",
    moderator: p("u5"),
  },
  "one-vs-many": {
    kind: "one-vs-many",
    solo: p("u6"),
    team: { members: [p("u1"), p("u2")] },
    winnerSide: "solo",
  },
};

const KINDS = Object.keys(OUTCOMES);

async function participantsOf(db: Client, matchId: number): Promise<string[]> {
  const { rows } = await db.execute({
    sql: "SELECT user_id FROM match_participants WHERE match_id = ? ORDER BY user_id",
    args: [matchId],
  });
  return rows.map((r) => String(r.user_id));
}

describe("migration 0024 — match_participants backfill", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await db.execute("PRAGMA foreign_keys = ON");
    await runMigrations(db);
    await db.batch(
      ["u1", "u2", "u3", "u4", "u5", "u6"].map((id) => ({
        sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
              VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01')`,
        args: [id, id.toUpperCase(), `${id}@example.com`],
      })),
      "write",
    );
    await db.batch(
      KINDS.map((kind, i) => ({
        sql: INSERT_MATCH,
        args: [i + 1, "chess", JSON.stringify(OUTCOMES[kind])],
      })),
      "write",
    );
    await db.batch([...matchParticipants.statements], "write");
  });

  afterEach(() => {
    db.close();
  });

  for (const [index, kind] of KINDS.entries()) {
    it(`indexes exactly extractParticipantIds for a ${kind} outcome`, async () => {
      const expected = [...extractParticipantIds(OUTCOMES[kind])].sort();
      expect(await participantsOf(db, index + 1)).toEqual(expected);
    });
  }

  it("includes the non-competing moderator slot on both teams and coop", async () => {
    expect(await participantsOf(db, KINDS.indexOf("teams") + 1)).toContain("u6");
    expect(await participantsOf(db, KINDS.indexOf("coop") + 1)).toContain("u5");
  });

  it("is idempotent — replaying it changes nothing", async () => {
    const before = await db.execute("SELECT COUNT(*) AS n FROM match_participants");
    await db.batch([...matchParticipants.statements], "write");
    const after = await db.execute("SELECT COUNT(*) AS n FROM match_participants");
    expect(Number(after.rows[0].n)).toBe(Number(before.rows[0].n));
  });

  it("skips ids of accounts that no longer exist instead of failing the migration", async () => {
    await db.execute({
      sql: INSERT_MATCH,
      args: [
        99,
        "chess",
        JSON.stringify({
          kind: "free-for-all",
          players: [
            { ...p("u1"), score: 1 },
            { ...p("deleted-account"), score: 0 },
          ],
        }),
      ],
    });
    await db.batch([...matchParticipants.statements], "write");
    expect(await participantsOf(db, 99)).toEqual(["u1"]);
  });

  it("cascades when the match is deleted", async () => {
    await db.execute("DELETE FROM match_results WHERE id = 1");
    expect(await participantsOf(db, 1)).toEqual([]);
  });

  it("cascades when the user is deleted", async () => {
    await db.execute(`DELETE FROM "user" WHERE id = 'u6'`);
    const { rows } = await db.execute(
      "SELECT COUNT(*) AS n FROM match_participants WHERE user_id = 'u6'",
    );
    expect(Number(rows[0].n)).toBe(0);
  });
});
