import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ current: null as Client | null }));
vi.mock("../db.ts", () => ({
  getDb: () => db.current,
  getDbConnectionConfig: () => ({ url: ":memory:", authToken: undefined }),
}));

const { runMigrations } = await import("../migrations/migrator.ts");
const { getMatchLog, listMatches, saveMatch } = await import("./store.ts");

async function addUser(id: string, name: string): Promise<void> {
  await db.current?.execute({
    sql: `INSERT INTO "user" (id, name, email, emailVerified, createdAt, updatedAt)
          VALUES (?, ?, ?, 1, date('now'), date('now'))`,
    args: [id, name, `${id}@example.test`],
  });
}

beforeEach(async () => {
  db.current = createClient({ url: ":memory:" });
  await db.current.execute("PRAGMA foreign_keys = ON");
  await runMigrations(db.current);
  await addUser("ana", "Ana");
  await addUser("bo", "Bo");
});

afterEach(() => {
  db.current?.close();
});

describe("match store", () => {
  it("saves a game with its seats and lists it from the player's seat", async () => {
    const id = await saveMatch({
      gameSlug: "durak",
      seed: 7,
      // Seat 1 is the durak: the other two share first place.
      outcome: { kind: "ranked", placements: [1, 3, 1] },
      log: { formatVersion: 1, seed: 7 },
      seats: [
        { kind: "human", userId: "ana", strategy: null },
        { kind: "human", userId: "bo", strategy: null },
        { kind: "ai", userId: null, strategy: "heuristic-v1" },
      ],
    });

    const [mine] = await listMatches("durak", "bo", 10);
    expect(mine).toMatchObject({
      id,
      playerCount: 3,
      viewerSeat: 1,
      outcome: { kind: "ranked", placements: [1, 3, 1] },
      seats: [
        { seat: 0, kind: "human", name: "Ana", isViewer: false, strategy: null },
        { seat: 1, kind: "human", name: "Bo", isViewer: true, strategy: null },
        { seat: 2, kind: "ai", name: null, isViewer: false, strategy: "heuristic-v1" },
      ],
    });
    expect(await getMatchLog("durak", id)).toEqual({ formatVersion: 1, seed: 7 });
  });

  it("stores each seat's result so per-player stats are a lookup", async () => {
    const id = await saveMatch({
      gameSlug: "sky-team",
      seed: 1,
      outcome: { kind: "coop", won: true },
      log: { formatVersion: 1 },
      seats: [
        { kind: "human", userId: "ana", strategy: null },
        { kind: "ai", userId: null, strategy: "heuristic-v1" },
      ],
    });
    const { rows } = await (db.current as Client).execute({
      sql: "SELECT seat, result, placement FROM replay_seats WHERE replay_id = ? ORDER BY seat",
      args: [id],
    });
    expect(rows.map((r) => [r.seat, r.result, r.placement])).toEqual([
      [0, "win", null],
      [1, "win", null],
    ]);
  });

  it("lists only games the account sat in, plus legacy games saved before seats", async () => {
    await saveMatch({
      gameSlug: "lost-cities",
      seed: 1,
      outcome: { kind: "ranked", placements: [1, 2], scores: [40, 3] },
      log: { formatVersion: 2 },
      seats: [
        { kind: "human", userId: "ana", strategy: null },
        { kind: "ai", userId: null, strategy: "ismcts-v4" },
      ],
    });
    // A row from before migration 0046: no outcome, no seats, a legacy winner.
    await (db.current as Client).execute(
      `INSERT INTO session_replays (game_slug, replay_json, winner, player_count)
       VALUES ('lost-cities', '{}', 'p1', 2)`,
    );

    const forBo = await listMatches("lost-cities", "bo", 10);
    expect(forBo).toHaveLength(1);
    expect(forBo[0]).toMatchObject({
      seats: [],
      viewerSeat: 0,
      outcome: { kind: "ranked", placements: [2, 1] },
    });
    expect(await listMatches("lost-cities", "ana", 10)).toHaveLength(2);
  });

  it("scopes a replay log to its game", async () => {
    const id = await saveMatch({
      gameSlug: "parks",
      seed: 3,
      outcome: { kind: "ranked", placements: [1, 2] },
      log: { formatVersion: 1 },
      seats: [
        { kind: "human", userId: "ana", strategy: null },
        { kind: "ai", userId: null, strategy: "random" },
      ],
    });
    expect(await getMatchLog("durak", id)).toBeNull();
  });
});
