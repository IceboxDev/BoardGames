import { START_FEN } from "@boardgames/core/games/chess/engine/fen";
import { type Client, createClient } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../../migrations/migrator.ts";
import { lookupExplorer, saveExplorer } from "./explorer-cache.ts";

const QUIET = { info() {}, warn() {} };
const AFTER_E4 = "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1";

describe("explorer cache", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await runMigrations(db, { logger: QUIET });
  });
  afterEach(() => db.close());

  it("keeps an answer by position, whatever the move counters, without illegal moves", async () => {
    const saved = await saveExplorer(db, [
      {
        fen: AFTER_E4,
        games: 100,
        moves: [
          { uci: "e7e5", white: 10, draws: 5, black: 9 },
          { uci: "c7c5", white: 20, draws: 10, black: 30 },
          { uci: "e2e4", white: 1, draws: 1, black: 1 },
        ],
      },
    ]);
    expect(saved).toBe(1);
    const sameSpot = AFTER_E4.replace(" 0 1", " 3 9");
    const found = await lookupExplorer(db, [sameSpot, START_FEN, "not a fen"]);
    expect([...found.keys()]).toEqual([sameSpot]);
    expect(found.get(sameSpot)?.moves.map((m) => m.uci)).toEqual(["c7c5", "e7e5"]);
  });

  it("treats an answer older than half a year as missing", async () => {
    await saveExplorer(db, [{ fen: AFTER_E4, games: 1, moves: [] }]);
    await db.execute("UPDATE chess_explorer_cache SET fetched_at = datetime('now', '-200 days')");
    expect((await lookupExplorer(db, [AFTER_E4])).size).toBe(0);
  });
});
