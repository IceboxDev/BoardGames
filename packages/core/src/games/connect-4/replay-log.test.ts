import { describe, expect, it } from "vitest";
import { connect4Manifest } from "./manifest";
import { buildReplayLog, Connect4ReplayLogSchema, replayPositions } from "./replay-log";
import { applyAction, createInitialState } from "./rules";

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

describe("replayPositions", () => {
  const log = Connect4ReplayLogSchema.parse(buildReplayLog(finishedSeries()));
  const positions = replayPositions(log);

  it("steps through every position of every game", () => {
    // Game 1: 8 positions (0..7 moves), game 2: 2, game 3: 1 (resigned at once).
    expect(positions).toHaveLength(11);
    expect(positions.map((p) => [p.game, p.ply])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [0, 3],
      [0, 4],
      [0, 5],
      [0, 6],
      [0, 7],
      [1, 0],
      [1, 1],
      [2, 0],
    ]);
  });

  it("shows each position as the live game did", () => {
    expect(positions[0].view.phase).toBe("playing");
    expect(positions[7].view.winningCells).toHaveLength(4);
    expect(positions[7].view.phase).toBe("between-games");
    expect(positions[7].view.wins).toEqual([1, 0]);
    expect(positions[8].view.currentPlayer).toBe(1);
    expect(positions[8].view.board.flat().every((v) => v === null)).toBe(true);
    expect(positions[9]).toMatchObject({ resigned: 0, move: { column: 3, player: 1 } });
    expect(positions.at(-1)?.view.phase).toBe("game-over");
    expect(positions.at(-1)?.view.seriesWinner).toBe(1);
  });

  it("keeps each position independent of the next", () => {
    expect(positions[1].view.moves).toHaveLength(1);
    expect(positions[2].view.moves).toHaveLength(2);
  });

  it("refuses a log that doesn't replay to its own result", () => {
    expect(() => replayPositions({ ...log, seriesWinner: 0 })).toThrow(/own result/);
    const tampered = structuredClone(log);
    tampered.games[0].moves[1].column = 0; // stacks Red's column with Yellow — then Red's 4th isn't four
    expect(() => replayPositions(tampered)).toThrow();
  });
});
