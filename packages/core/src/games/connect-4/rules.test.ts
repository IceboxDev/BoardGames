import { describe, expect, it } from "vitest";
import { createRng } from "../../lib/rng";
import { connect4Manifest } from "./manifest";
import { applyAction, createBoard, createInitialState, discMoves, getLegalActions } from "./rules";
import { EMPTY, SearchBoard } from "./search/board";
import type { Action, Board, GameState, Seat } from "./types";

function newGame(config: Record<string, unknown> = {}, seed = 1): GameState {
  return createInitialState([null, null], connect4Manifest.config.parse(config), seed);
}

function drops(state: GameState, columns: number[]): void {
  for (const column of columns) applyAction(state, { type: "drop", column }, state.currentPlayer);
}

/** A board from columns written bottom-up, "R" = seat 0, "Y" = seat 1. */
function boardOf(cols: number, rows: number, columns: string[]): Board {
  const board = createBoard(cols, rows);
  columns.forEach((col, c) => {
    [...col].forEach((ch, r) => {
      board[c][r] = ch === "R" ? 0 : 1;
    });
  });
  return board;
}

describe("drops and wins", () => {
  it("defaults to a 7×6 board with seat 0 opening", () => {
    const s = newGame();
    expect([s.cols, s.rows, s.currentPlayer]).toEqual([7, 6, 0]);
    expect(discMoves(s)).toHaveLength(7);
  });

  it("wins vertically", () => {
    const s = newGame();
    drops(s, [0, 1, 0, 1, 0, 1, 0]);
    expect(s.phase).toBe("game-over");
    expect(s.seriesWinner).toBe(0);
    expect(s.games[0].reason).toBe("connect");
    expect(s.winningCells).toHaveLength(4);
  });

  it("wins horizontally at the right edge", () => {
    const s = newGame();
    drops(s, [3, 3, 4, 4, 5, 5, 6]);
    expect(s.seriesWinner).toBe(0);
    expect(s.winningCells.map((c) => c.column).sort()).toEqual([3, 4, 5, 6]);
  });

  it("wins on both diagonals", () => {
    const up = newGame();
    drops(up, [0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
    expect(up.seriesWinner).toBe(0);
    expect(up.winningCells).toEqual(
      expect.arrayContaining([
        { column: 0, row: 0 },
        { column: 3, row: 3 },
      ]),
    );
    const down = newGame();
    drops(down, [6, 5, 5, 4, 4, 3, 4, 3, 3, 0, 3]);
    expect(down.seriesWinner).toBe(0);
  });

  it("reports a run of five in full", () => {
    const s = newGame();
    drops(s, [0, 0, 1, 1, 3, 3, 4, 4, 2]);
    expect(s.winningCells).toHaveLength(5);
  });

  it("refuses a drop into a full column and a move out of turn", () => {
    const s = newGame();
    drops(s, [0, 0, 0, 0, 0, 0]);
    expect(() => applyAction(s, { type: "drop", column: 0 }, s.currentPlayer)).toThrow();
    expect(() => applyAction(s, { type: "drop", column: 1 }, 1)).toThrow();
  });

  it("draws a full board", () => {
    const s = newGame({ board: "6x5" });
    // ((c >> 1) + r) parity never lines up four; leave the last cell open.
    for (let c = 0; c < 6; c++) {
      for (let r = 0; r < 5; r++) s.board[c][r] = (((c >> 1) + r) & 1) as Seat;
    }
    s.board[5][4] = null;
    s.currentPlayer = (((5 >> 1) + 4) & 1) as Seat;
    drops(s, [5]);
    expect(s.games[0]).toMatchObject({ reason: "full", winner: null });
    expect(s.seriesWinner).toBeNull();
  });
});

describe("PopOut", () => {
  it("lets a seat pop only its own bottom disc", () => {
    const s = newGame({ popOut: true });
    drops(s, [0, 1]);
    expect(getLegalActions(s, 0).filter((a) => a.type === "pop")).toEqual([
      { type: "pop", column: 0 },
    ]);
    expect(() => applyAction(s, { type: "pop", column: 1 }, 0)).toThrow();
  });

  it("shifts the column down", () => {
    const s = newGame({ popOut: true });
    drops(s, [1, 0, 2, 0, 6]);
    applyAction(s, { type: "pop", column: 0 }, 1);
    expect(s.board[0].slice(0, 2)).toEqual([1, null]);
    expect(s.moves.at(-1)).toEqual({ type: "pop", column: 0, row: 0, player: 1 });
    expect(s.currentPlayer).toBe(0);
  });

  it("gives the game to the opponent when a pop completes their four", () => {
    const s = newGame({ popOut: true });
    s.board = boardOf(7, 6, ["Y", "Y", "Y", "RY"]);
    s.currentPlayer = 0;
    applyAction(s, { type: "pop", column: 3 }, 0);
    expect(s.games[0]).toMatchObject({ winner: 1, reason: "connect" });
  });

  it("gives the game to the popper when a pop completes four for both", () => {
    const s = newGame({ popOut: true });
    s.board = boardOf(7, 6, ["YR", "YR", "YR", "RYR"]);
    s.currentPlayer = 0;
    applyAction(s, { type: "pop", column: 3 }, 0);
    expect(s.games[0]).toMatchObject({ winner: 0, reason: "connect" });
    expect(s.winningCells.every((c) => s.board[c.column][c.row] === 0)).toBe(true);
  });

  it("draws on the third repetition of a position", () => {
    const s = newGame({ popOut: true });
    const cycle: [Action, Seat][] = [
      [{ type: "drop", column: 0 }, 0],
      [{ type: "drop", column: 6 }, 1],
      [{ type: "pop", column: 0 }, 0],
      [{ type: "pop", column: 6 }, 1],
    ];
    for (const [action, seat] of [...cycle, ...cycle]) {
      if (s.phase !== "playing") break;
      applyAction(s, action, seat);
    }
    expect(s.games[0]).toMatchObject({ winner: null, reason: "repetition" });
  });

  it("keeps going on a full board while a pop is possible", () => {
    const s = newGame({ board: "6x5", popOut: true });
    for (let c = 0; c < 6; c++) {
      for (let r = 0; r < 5; r++) s.board[c][r] = (((c >> 1) + r) & 1) as Seat;
    }
    s.board[5][4] = null;
    s.currentPlayer = (((5 >> 1) + 4) & 1) as Seat;
    drops(s, [5]);
    expect(s.phase).toBe("playing");
    expect(discMoves(s).every((a) => a.type === "pop")).toBe(true);
  });
});

describe("resigning and series", () => {
  it("lets either person resign, even off turn", () => {
    const s = newGame();
    expect(getLegalActions(s, 1)).toEqual([{ type: "resign" }]);
    applyAction(s, { type: "resign" }, 1);
    expect(s.games[0]).toMatchObject({ winner: 0, reason: "resign", resigned: 1 });
    expect(s.seriesWinner).toBe(0);
  });

  it("never offers an AI seat a resignation or the next game", () => {
    const s = createInitialState(
      [null, "blocker"],
      connect4Manifest.config.parse({ bestOf: 3 }),
      1,
    );
    expect(getLegalActions(s, 1)).toEqual([]);
    applyAction(s, { type: "resign" }, 0);
    expect(s.phase).toBe("between-games");
    expect(getLegalActions(s, 1)).toEqual([]);
    expect(getLegalActions(s, 0)).toEqual([{ type: "continue" }]);
  });

  it("alternates the opener and ends a best-of-three once it is decided", () => {
    const s = newGame({ bestOf: 3 });
    applyAction(s, { type: "resign" }, 0); // Yellow 1–0
    expect(s.phase).toBe("between-games");
    applyAction(s, { type: "continue" }, 1);
    expect([s.gameIndex, s.firstPlayer, s.currentPlayer]).toEqual([1, 1, 1]);
    expect(s.board.flat().every((v) => v === null)).toBe(true);
    applyAction(s, { type: "resign" }, 0); // Yellow 2–0: decided
    expect(s.phase).toBe("game-over");
    expect(s.seriesWinner).toBe(1);
    expect(s.wins).toEqual([0, 2]);
  });

  it("calls a level series a draw", () => {
    const s = newGame({ bestOf: 3 });
    applyAction(s, { type: "resign" }, 0);
    applyAction(s, { type: "continue" }, 0);
    applyAction(s, { type: "resign" }, 1);
    applyAction(s, { type: "continue" }, 0);
    // Game 3 drawn: the only way left to finish level.
    for (let c = 0; c < 7; c++) {
      for (let r = 0; r < 6; r++) s.board[c][r] = (((c >> 1) + r) & 1) as Seat;
    }
    s.board[6][5] = null;
    s.currentPlayer = (((6 >> 1) + 5) & 1) as Seat;
    drops(s, [6]);
    expect(s.games.map((g) => g.winner)).toEqual([1, 0, null]);
    expect(s.phase).toBe("game-over");
    expect(s.seriesWinner).toBeNull();
  });

  it("picks the opener from the seed when asked", () => {
    const openers = new Set(
      Array.from(
        { length: 20 },
        (_, seed) => newGame({ firstPlayer: "random" }, seed).currentPlayer,
      ),
    );
    expect(openers).toEqual(new Set([0, 1]));
    expect(newGame({ firstPlayer: "seat1" }).currentPlayer).toBe(1);
  });
});

describe("the search board agrees with the rules", () => {
  for (const [board, popOut] of [
    ["7x6", false],
    ["7x6", true],
    ["6x5", true],
    ["8x7", false],
  ] as const) {
    it(`${board}${popOut ? " PopOut" : ""}: same moves, same winner, undo restores`, () => {
      const rng = createRng(board.length * 7 + (popOut ? 1 : 0));
      for (let game = 0; game < 60; game++) {
        const s = newGame({ board, popOut }, game);
        const sb = SearchBoard.fromState(s);
        const buf = new Int32Array(sb.cols * 2);
        while (s.phase === "playing") {
          const legal = discMoves(s);
          const n = sb.moves(buf);
          const fromSearch = Array.from(buf.subarray(0, n), (m) =>
            m < sb.cols ? `drop${m}` : `pop${m - sb.cols}`,
          ).sort();
          expect(fromSearch).toEqual(
            legal.map((a) => `${a.type}${"column" in a ? a.column : ""}`).sort(),
          );
          const action = legal[Math.floor(rng() * legal.length)];
          const move =
            action.type === "drop"
              ? action.column
              : sb.cols + (action.type === "pop" ? action.column : 0);
          const before = sb.cells.slice();
          const won = sb.play(move);
          sb.undo(move);
          expect(sb.cells).toEqual(before);
          sb.play(move);
          const mover = s.currentPlayer;
          applyAction(s, action, mover);
          if (s.games.length > 0 && s.games[0].reason === "connect") {
            expect(won).toBe(s.games[0].winner);
          } else if (s.phase === "playing") {
            expect(won).toBe(EMPTY);
          }
        }
      }
    });
  }
});
