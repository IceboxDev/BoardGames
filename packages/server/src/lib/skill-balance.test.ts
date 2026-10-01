// The team mixer's balanced split, against a real migrated database: the live
// fit reads the history as it stands (no recompute needed) and is refreshed
// the moment a match lands.

import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMigrations } from "../migrations/migrator.ts";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { balanceTeamsFor, liveSkillFit } = await import("./skill-ratings.ts");

const QUIET = { info() {}, warn() {} };
const PLAYERS = ["ace", "bee", "cat", "dan"];

async function addUser(client: Client, id: string): Promise<void> {
  await client.execute({
    sql: `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt", guest, internal)
          VALUES (?, ?, ?, 0, '2020-01-01', '2020-01-01', 0, 0)`,
    args: [id, id.toUpperCase(), `${id}@example.com`],
  });
}

async function addWin(client: Client, slug: string, winner: string, loser: string, day: number) {
  const outcome = {
    kind: "free-for-all",
    players: [
      { userId: winner, displayName: winner, score: 10, rank: 1 },
      { userId: loser, displayName: loser, score: 5, rank: 2 },
    ],
  };
  await client.execute({
    sql: `INSERT INTO match_results
            (date_key, played_at, game_slug, game_title, outcome_json, recorded_by, recorded_at)
          VALUES (NULL, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [
      `2026-01-${String(day).padStart(2, "0")}T18:00:00.000Z`,
      slug,
      slug,
      JSON.stringify(outcome),
      winner,
    ],
  });
}

describe("balanceTeamsFor", () => {
  beforeEach(async () => {
    const client = createClient({ url: ":memory:" });
    await runMigrations(client, { logger: QUIET });
    for (const id of PLAYERS) await addUser(client, id);
    db.current = client;
  });

  afterEach(() => {
    db.current?.close();
    db.current = null;
  });

  it("never pairs the two strongest, and reports how each strength was known", async () => {
    const client = db.current as Client;
    // ace and bee beat cat and dan again and again at Codenames.
    let day = 1;
    for (let i = 0; i < 4; i++) {
      for (const w of ["ace", "bee"]) {
        for (const l of ["cat", "dan"]) await addWin(client, "codenames", w, l, (day++ % 28) + 1);
      }
    }
    for (let seed = 0; seed < 6; seed++) {
      const res = await balanceTeamsFor({
        slug: "codenames",
        userIds: [...PLAYERS, "ghost"],
        teamCount: 2,
        seed,
      });
      expect(res.teams.flatMap((t) => t.userIds).sort()).toEqual([...PLAYERS, "ghost"].sort());
      expect(res.teams.some((t) => t.userIds.includes("ace") && t.userIds.includes("bee"))).toBe(
        false,
      );
      expect(res.teams.reduce((a, t) => a + t.chance, 0)).toBeCloseTo(1);
    }
    const res = await balanceTeamsFor({
      slug: "decrypto",
      userIds: [...PLAYERS, "ghost"],
      teamCount: 2,
      seed: 1,
    });
    expect(res.basis).toMatchObject({ ace: "traits", ghost: "unknown" });
    const played = await balanceTeamsFor({
      slug: "codenames",
      userIds: PLAYERS,
      teamCount: 2,
      seed: 1,
    });
    expect(played.basis.ace).toBe("game");
  });

  it("refits as soon as a match lands", async () => {
    const client = db.current as Client;
    await addWin(client, "codenames", "ace", "bee", 1);
    const first = await liveSkillFit();
    expect(await liveSkillFit()).toBe(first);
    await addWin(client, "codenames", "cat", "dan", 2);
    expect(await liveSkillFit()).not.toBe(first);
  });
});
