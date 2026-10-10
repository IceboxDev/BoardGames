import { connect4Manifest } from "@boardgames/core/games/connect-4/manifest";
import {
  buildReplayLog,
  Connect4ReplayLogSchema,
} from "@boardgames/core/games/connect-4/replay-log";
import { applyAction, createInitialState } from "@boardgames/core/games/connect-4/rules";
import { describe, expect, it } from "vitest";
import { mapConnect4Log } from "../log-mapper";
import { replayGames } from "./replay";

function finishedSeries() {
  const state = createInitialState([null, null], connect4Manifest.config.parse({ bestOf: 3 }), 1);
  // Game 1: Red wins vertically. Game 2: Yellow opens and Red resigns. Game 3: Red resigns.
  for (const c of [0, 1, 0, 1, 0, 1, 0]) {
    applyAction(state, { type: "drop", column: c }, state.currentPlayer);
  }
  applyAction(state, { type: "continue" }, 0);
  applyAction(state, { type: "drop", column: 3 }, 1);
  applyAction(state, { type: "resign" }, 0);
  applyAction(state, { type: "continue" }, 1);
  applyAction(state, { type: "resign" }, 0);
  return state;
}

describe("Connect 4 replay", () => {
  it("rebuilds every game of the series through the engine", () => {
    const log = Connect4ReplayLogSchema.parse(buildReplayLog(finishedSeries()));
    const series = replayGames(log);
    expect(series).toMatchObject({ cols: 7, rows: 6, popOut: false, wins: [1, 2] });
    expect(series?.games.map((g) => [g.reason, g.winner, g.moves.length])).toEqual([
      ["connect", 0, 7],
      ["resign", 1, 1],
      ["resign", 1, 0],
    ]);
  });

  it("can't show a log that doesn't replay", () => {
    const log = Connect4ReplayLogSchema.parse(buildReplayLog(finishedSeries()));
    expect(replayGames({ ...log, seriesWinner: 0 })).toBeNull();
  });

  it("logs each game in its own block", () => {
    const state = finishedSeries();
    const blocks = mapConnect4Log(state.games, { moves: [], inProgress: false }, ["Ann", "Bo"]);
    expect(blocks.map((b) => b.label)).toEqual(["Game 1", "Game 2", "Game 3"]);
    expect(blocks[0].actions).toHaveLength(8);
    expect(blocks[0].actions.at(-1)?.spans).toContain(" connects four");
    expect(blocks[1].actions.at(-1)?.spans).toContain(" resigns");
  });
});
