import { applyMove } from "@boardgames/core/games/chess/engine/apply";
import { parseFen, START_FEN, toFen } from "@boardgames/core/games/chess/engine/fen";
import { legalMoves } from "@boardgames/core/games/chess/engine/movegen";
import { moveToUci } from "@boardgames/core/games/chess/engine/uci";
import { PositionIndex } from "@boardgames/core/games/chess/trainer/position-index";
import type { FarmJob, PositionEval } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { followUps } from "./follow-ups.ts";

function fenAfter(moves: string): string {
  let pos = parseFen(START_FEN);
  for (const uci of moves.split(" ").filter(Boolean)) {
    const move = legalMoves(pos).find((m) => moveToUci(m) === uci);
    if (!move) throw new Error(`illegal ${uci}`);
    pos = applyMove(pos, move);
  }
  return toFen(pos);
}

// The member played White in all of these.
const index = PositionIndex.build(
  ["e2e4 e7e5 g1f3 b8c6", "e2e4 e7e5 g1f3 d7d6", "e2e4 c7c5 g1f3", "d2d4 d7d5"].map((line, i) => ({
    id: `g${i}`,
    moves: line.split(" "),
    result: "win" as const,
  })),
);

const job = (moves: string, kind: "user" | "opp", reach: number): FarmJob => ({
  id: 1,
  fen: fenAfter(moves),
  kind,
  reach,
  spec: "BEST_MOVE_V2",
  attempts: 1,
  requestedBy: "member-1",
  stage: 0,
});

const result = (j: FarmJob, best: string, others: string[] = []): PositionEval => ({
  fen: j.fen,
  kind: j.kind,
  spec: "BEST_MOVE_V2",
  best,
  lines: [best, ...others].map((uci) => ({
    uci,
    cp: 0,
    mate: null,
    depth: 40,
    seldepth: null,
    nodes: null,
    pv: [uci],
  })),
  lc0: null,
  ties: [best],
  contested: false,
  depth: 40,
  source: "farm",
  engine: "test",
  seconds: 1,
});

describe("followUps", () => {
  it("after your first move: the opponent position (its engine verdict), then your replies", () => {
    const j = job("", "user", 4);
    expect(followUps(j, result(j, "e2e4"), index)).toEqual([
      { fen: fenAfter("e2e4"), kind: "opp", reach: 3, stage: 0 },
      { fen: fenAfter("e2e4 e7e5"), kind: "user", reach: 2, stage: 0 },
      { fen: fenAfter("e2e4 c7c5"), kind: "user", reach: 1, stage: 0 },
    ]);
  });

  it("queues the opponent position first, then your replies", () => {
    const j = job("e2e4 e7e5", "user", 2);
    expect(followUps(j, result(j, "g1f3"), index)).toEqual([
      { fen: fenAfter("e2e4 e7e5 g1f3"), kind: "opp", reach: 2, stage: 0 },
      { fen: fenAfter("e2e4 e7e5 g1f3 b8c6"), kind: "user", reach: 1, stage: 0 },
      { fen: fenAfter("e2e4 e7e5 g1f3 d7d6"), kind: "user", reach: 1, stage: 0 },
    ]);
  });

  it("extends a line end three steps, and stops at positions no game reached", () => {
    // Your games reached 1.e4 e5 and none played 2.Nc3: the extension starts.
    const j = job("e2e4 e7e5", "user", 2);
    expect(followUps(j, result(j, "b1c3"), index)).toEqual([
      { fen: fenAfter("e2e4 e7e5 b1c3"), kind: "opp", reach: 0, stage: 1 },
    ]);
    // 1: the opponent's three replies (padded the trainer's way), your answer to each.
    const one = { ...job("e2e4 e7e5 b1c3", "opp", 0), stage: 1 };
    expect(followUps(one, result(one, "g8f6", ["b8c6", "f8c5"]), index, ["b8c6"])).toEqual([
      { fen: fenAfter("e2e4 e7e5 b1c3 b8c6"), kind: "user", reach: 0, stage: 2 },
      { fen: fenAfter("e2e4 e7e5 b1c3 g8f6"), kind: "user", reach: 0, stage: 2 },
      { fen: fenAfter("e2e4 e7e5 b1c3 f8c5"), kind: "user", reach: 0, stage: 2 },
    ]);
    // 2: your best answer leads to the last opponent position.
    const two = { ...job("e2e4 e7e5 b1c3 g8f6", "user", 0), stage: 2 };
    expect(followUps(two, result(two, "f1c4"), index)).toEqual([
      { fen: fenAfter("e2e4 e7e5 b1c3 g8f6 f1c4"), kind: "opp", reach: 0, stage: 3 },
    ]);
    // 3: its replies are the tree's leaves — nothing more.
    const three = { ...job("e2e4 e7e5 b1c3 g8f6 f1c4", "opp", 0), stage: 3 };
    expect(followUps(three, result(three, "f8c5"), index, ["b8c6"])).toEqual([]);
    // Your answer to a reply no game reached: the opponent position after it is the last step.
    const padded = job("e2e4 e7e5", "user", 0);
    expect(followUps(padded, result(padded, "g1f3"), index)).toEqual([
      { fen: fenAfter("e2e4 e7e5 g1f3"), kind: "opp", reach: 0, stage: 3 },
    ]);
    // …unless it mates.
    const mating = job("f2f3 e7e5 g2g4", "user", 0);
    expect(followUps(mating, result(mating, "d8h4"), index)).toEqual([]);
  });

  it("an opponent position: your reply after each move the trainer's padding adds", () => {
    // Two replies played (b8c6, d7d6): the most popular is one of them, so the
    // third is the engine's best — the order the trainer pads in.
    const two = job("e2e4 e7e5 g1f3", "opp", 2);
    expect(followUps(two, result(two, "g8f6", ["b8c6"]), index, ["b8c6", "f8c5"])).toEqual([
      { fen: fenAfter("e2e4 e7e5 g1f3 g8f6"), kind: "user", reach: 0, stage: 0 },
    ]);
    // …and a popular move not played comes before the engine's.
    expect(followUps(two, result(two, "g8f6"), index, ["f8c5", "b8c6"])).toEqual([
      { fen: fenAfter("e2e4 e7e5 g1f3 f8c5"), kind: "user", reach: 0, stage: 0 },
    ]);
    // A deviation leaf (reach 0): answered, never grown from.
    const leaf = job("e2e4 e7e5 f1c4", "opp", 0);
    expect(followUps(leaf, result(leaf, "g8f6", ["b8c6", "f8c5"]), index, ["b8c6"])).toEqual([]);
    // Nothing played: most popular, best, 2nd most popular.
    const none = job("e2e4 e7e5 f1c4", "opp", 1);
    expect(
      followUps(none, result(none, "g8f6", ["b8c6", "f8c5"]), index, ["b8c6", "f8c5"]),
    ).toEqual([
      { fen: fenAfter("e2e4 e7e5 f1c4 b8c6"), kind: "user", reach: 0, stage: 0 },
      { fen: fenAfter("e2e4 e7e5 f1c4 g8f6"), kind: "user", reach: 0, stage: 0 },
      { fen: fenAfter("e2e4 e7e5 f1c4 f8c5"), kind: "user", reach: 0, stage: 0 },
    ]);
    // Three played: nothing to pad.
    const full = job("e2e4", "opp", 3);
    expect(followUps(full, result(full, "e7e5"), index, ["c7c5"])).toEqual([]);
  });
});
