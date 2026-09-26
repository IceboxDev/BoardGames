// ---------------------------------------------------------------------------
// The printed board, as mapped in the dev board editor (`/dev/hunger-board`,
// which publishes `boards/board-a.json`), plus the fixed test layout.
//
// Side A (Rookie) and side B (Elder) are the same map: they differ only in
// the Mountains — on A a Vampire there at sunrise survives (losing any VP the
// space prints), on B it burns. So side B is side A without the printed
// penalties, and the Elder rule itself lives in `scoring.fateOf`.
// ---------------------------------------------------------------------------

import type { BoardDef, BoardId } from "../types";
import { boardProblems, parseBoard } from "./board-schema";
import boardA from "./boards/board-a.json" with { type: "json" };
import { TEST_BOARD } from "./test-board";

function load(raw: unknown, name: string): BoardDef {
  const def = parseBoard(raw);
  const errors = boardProblems(def).filter((p) => p.level === "error");
  if (errors.length > 0) {
    throw new Error(`${name} cannot be played: ${errors.map((e) => e.message).join("; ")}`);
  }
  return def;
}

const A = load(boardA, "Board side A");

/** Side B: side A's map, without the Rookie sunrise penalties. */
const B: BoardDef = {
  ...A,
  side: "B",
  spaces: A.spaces.map(({ mountainPenalty: _penalty, ...space }) => space),
};

export const BOARDS: Record<BoardId, BoardDef> = { A, B, test: TEST_BOARD };
