import { describe, expect, it } from "vitest";
import { fromGtp, toGtp } from "./coords";
import { koPoint, legalPoints, newGame, play, playStone, replay, rewind } from "./game";
import { handicapPoints, handicapProblem } from "./handicap";
import { areaScore } from "./scoring";
import { IllegalMove } from "./types";

const at = (size: number, v: string): number => {
  const p = fromGtp(size, v);
  if (p === undefined || p === null) throw new Error(`bad vertex ${v}`);
  return p;
};

/** Play a list of GTP vertices alternately from an empty `size` board. */
function moves(size: number, vertices: string[]) {
  return replay(
    { size, komi: 7.5, handicap: 0 },
    vertices.map((v) => at(size, v)),
  );
}

function expectIllegal(fn: () => unknown, reason: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(IllegalMove);
    expect((e as IllegalMove).reason).toBe(reason);
    return;
  }
  throw new Error("expected an illegal move");
}

describe("coordinates", () => {
  it("round-trips GTP vertices and skips I", () => {
    expect(toGtp(19, at(19, "D4"))).toBe("D4");
    expect(toGtp(19, at(19, "J19"))).toBe("J19");
    expect(fromGtp(19, "I5")).toBeUndefined();
    expect(fromGtp(9, "pass")).toBeNull();
    expect(fromGtp(9, "K1")).toBeUndefined();
  });
});

describe("captures", () => {
  it("captures a single stone in the corner", () => {
    // B A2, W A1, B B1 captures A1.
    const g = moves(9, ["A2", "A1", "B1"]);
    expect(g.board[at(9, "A1")]).toBe(0);
    expect(g.captures).toEqual([1, 0]);
    expect(g.moves.at(-1)?.captured).toEqual([at(9, "A1")]);
  });

  it("captures a multi-stone chain", () => {
    // White A1 A2 surrounded by Black A3 B2 B1.
    const g = moves(9, ["A3", "A1", "B2", "A2", "B1"]);
    expect(g.board[at(9, "A1")]).toBe(0);
    expect(g.board[at(9, "A2")]).toBe(0);
    expect(g.captures[0]).toBe(2);
  });

  it("forbids suicide but allows a capturing fill", () => {
    // Black B1 A2 surround A1; White may not play A1.
    const g = moves(9, ["B1", "J9", "A2"]);
    expectIllegal(() => playStone(g, at(9, "A1")), "suicide");
    expect(legalPoints(g)).not.toContain(at(9, "A1"));
  });

  it("forbids an occupied point", () => {
    const g = moves(9, ["E5"]);
    expectIllegal(() => playStone(g, at(9, "E5")), "occupied");
  });
});

describe("ko", () => {
  // A standard ko on the left edge: B takes at A2... build it explicitly.
  //   . B W .
  //   B W . W
  //   . B W .
  const koSetup = ["B4", "C4", "A3", "D3", "B2", "C2", "J9", "B3"];

  it("forbids the immediate retake and marks the ko point", () => {
    const g0 = moves(9, koSetup); // White B3 now sits in black's mouth with one liberty C3
    const g1 = playStone(g0, at(9, "C3")); // Black captures B3
    expect(g1.board[at(9, "B3")]).toBe(0);
    expect(koPoint(g1)).toBe(at(9, "B3"));
    expectIllegal(() => playStone(g1, at(9, "B3")), "superko");
    // After a ko threat exchange, the retake is fine.
    const g2 = playStone(playStone(g1, at(9, "H8")), at(9, "H7"));
    expect(() => playStone(g2, at(9, "B3"))).not.toThrow();
  });

  it("superko catches a quiet move that recreates a position", () => {
    const g0 = moves(9, koSetup);
    const g1 = playStone(g0, at(9, "C3"));
    expect(legalPoints(g1)).not.toContain(at(9, "B3"));
  });
});

describe("passes and undo", () => {
  it("counts consecutive passes and resets on a stone", () => {
    let g = newGame({ size: 9, komi: 7.5, handicap: 0 });
    g = play(play(g, null), null);
    expect(g.consecutivePasses).toBe(2);
    g = play(g, at(9, "E5"));
    expect(g.consecutivePasses).toBe(0);
  });

  it("rewinds to an earlier move", () => {
    const g = moves(9, ["A2", "A1", "B1"]);
    const back = rewind(g, 2);
    expect(back.board[at(9, "A1")]).toBe(2);
    expect(back.captures).toEqual([0, 0]);
    expect(back.toMove).toBe(0);
  });
});

describe("handicap", () => {
  it("places the standard stones and gives White the first move", () => {
    const g = newGame({ size: 19, komi: 0.5, handicap: 4 });
    expect(g.handicapStones.map((p) => toGtp(19, p)).sort()).toEqual(["D16", "D4", "Q16", "Q4"]);
    expect(g.toMove).toBe(1);
    expect(handicapPoints(19, 9)).toHaveLength(9);
    expect(handicapPoints(9, 5).map((p) => toGtp(9, p))).toContain("E5");
  });

  it("rejects a one-stone or oversized handicap", () => {
    expect(handicapProblem(19, 1)).not.toBeNull();
    expect(handicapProblem(9, 6)).not.toBeNull();
    expect(handicapProblem(13, 9)).toBeNull();
  });
});

describe("area scoring", () => {
  it("counts stones and surrounded territory, with komi", () => {
    // A black wall on column C and a white wall on column F of a 7-wide strip.
    let g = newGame({ size: 5, komi: 0.5, handicap: 0 });
    for (const [b, w] of [
      ["B1", "D1"],
      ["B2", "D2"],
      ["B3", "D3"],
      ["B4", "D4"],
      ["B5", "D5"],
    ] as const) {
      g = playStone(playStone(g, at(5, b)), at(5, w));
    }
    const s = areaScore(g.board, 5, [], 0.5, 0);
    // Black: 5 stones + column A (5). White: 5 stones + column E (5) + 0.5. Column C dame.
    expect(s.black.total).toBe(10);
    expect(s.white.total).toBe(10.5);
    expect(s.dame).toBe(5);
    expect(s.result).toBe("W+0.5");
    expect(s.winner).toBe(1);
  });

  it("lifts dead stones before counting and adds handicap compensation", () => {
    let g = newGame({ size: 5, komi: 0, handicap: 0 });
    g = playStone(g, at(5, "C3")); // black
    g = playStone(g, at(5, "A1")); // white, dead inside black's area
    const alive = areaScore(g.board, 5, [], 0, 0);
    expect(alive.dame).toBeGreaterThan(0);
    const scored = areaScore(g.board, 5, [at(5, "A1")], 0, 0);
    expect(scored.black.total).toBe(25);
    expect(scored.white.total).toBe(0);
    expect(areaScore(g.board, 5, [at(5, "A1")], 0.5, 3).white.bonus).toBe(3.5);
  });

  it("scores jigo as a draw", () => {
    const g = newGame({ size: 5, komi: 0, handicap: 0 });
    const s = areaScore(g.board, 5, [], 0, 0);
    expect(s.result).toBe("0");
    expect(s.winner).toBeNull();
  });
});
