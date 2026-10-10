import { describe, expect, it } from "vitest";
import { applyMove, applyMoveDetailed } from "./apply";
import { parseSquare } from "./board";
import { FenError, parseFen, positionKey, START_FEN, toFen } from "./fen";
import { legalMoves } from "./movegen";
import { parseSan, toSan } from "./san";
import { boardState, hasLoneKing, insufficientMaterial } from "./status";
import type { Move, Position } from "./types";
import { moveToUci, uciToMove } from "./uci";

const sq = (name: string): number => {
  const s = parseSquare(name);
  if (s === null) throw new Error(name);
  return s;
};

function play(fen: string, ...sans: string[]): Position {
  let pos = parseFen(fen);
  for (const san of sans) {
    const move = parseSan(pos, san);
    if (!move) throw new Error(`illegal ${san} in ${toFen(pos)}`);
    pos = applyMove(pos, move);
  }
  return pos;
}

const sansOf = (pos: Position): string[] => {
  const legal = legalMoves(pos);
  return legal.map((m) => toSan(pos, m, legal)).sort();
};

describe("FEN", () => {
  it.each([
    START_FEN,
    "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1",
    "8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1",
    "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3",
  ])("round-trips %s", (fen) => {
    expect(toFen(parseFen(fen))).toBe(fen);
  });

  it("omits an en-passant square no pawn can use", () => {
    const pos = play(START_FEN, "e4");
    expect(toFen(pos)).toBe("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1");
  });

  it("round-trips bughouse pockets and promoted markers", () => {
    const fen = "rnbqkb1r/pppppppp/5n2/8/8/8/PPPPPPPP/RNBQKBNQ~[QPnp] w Qkq - 0 1";
    const pos = parseFen(fen, { bughouse: true });
    expect(pos.pockets?.w).toEqual({ p: 1, n: 0, b: 0, r: 0, q: 1 });
    expect(pos.pockets?.b).toEqual({ p: 1, n: 1, b: 0, r: 0, q: 0 });
    expect(pos.promoted).toEqual([sq("h1")]);
    expect(toFen(pos)).toBe(fen);
  });

  it.each([
    ["too few fields", "8/8/8/8/8/8/8/8 w"],
    ["no kings", "8/8/8/8/8/8/8/8 w - - 0 1"],
    ["bad rank", "rnbqkbnr/ppppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"],
    ["bad side", "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1"],
  ])("rejects %s", (_name, fen) => {
    expect(() => parseFen(fen)).toThrow(FenError);
  });
});

describe("UCI", () => {
  it.each(["e2e4", "e7e8q", "e1g1", "N@f3", "P@e4"])("round-trips %s", (text) => {
    const move = uciToMove(text);
    expect(move).not.toBeNull();
    expect(moveToUci(move as Move)).toBe(text);
  });

  it.each(["e2e9", "e7e8k", "K@e4", "", "e2"])("rejects %s", (text) => {
    expect(uciToMove(text)).toBeNull();
  });
});

describe("SAN", () => {
  it("names castling, captures, promotions and checks", () => {
    const pos = parseFen("r3k2r/1P6/8/8/8/8/8/R3K2R w KQkq - 0 1");
    const sans = sansOf(pos);
    expect(sans).toContain("O-O");
    expect(sans).toContain("O-O-O");
    expect(sans).toContain("bxa8=Q+");
    expect(sans).toContain("b8=N");
  });

  it("disambiguates by file, then rank, then both", () => {
    const byFile = parseFen("4k3/8/8/8/8/8/8/R4RK1 w - - 0 1");
    expect(sansOf(byFile)).toEqual(expect.arrayContaining(["Rad1", "Rfd1"]));
    const byRank = parseFen("4k3/8/8/R7/8/8/8/R3K3 w - - 0 1");
    expect(sansOf(byRank)).toEqual(expect.arrayContaining(["R1a3", "R5a3"]));
    const both = parseFen("4k3/8/8/8/8/Q7/8/Q1Q1K3 w - - 0 1");
    expect(sansOf(both)).toContain("Qa1b2");
  });

  it("marks mate with #", () => {
    const pos = play(START_FEN, "f3", "e5", "g4");
    const legal = legalMoves(pos);
    const mate = legal.find((m) => toSan(pos, m, legal) === "Qh4#");
    expect(mate).toBeDefined();
    expect(boardState(applyMove(pos, mate as Move))).toBe("checkmate");
  });

  it("parses what it prints for every move of a busy position", () => {
    const pos = parseFen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");
    const legal = legalMoves(pos);
    for (const m of legal) expect(parseSan(pos, toSan(pos, m, legal))).toEqual(m);
  });
});

describe("rules", () => {
  it("captures en passant and removes the passed pawn", () => {
    const pos = play(START_FEN, "e4", "a6", "e5", "d5");
    const ep = parseSan(pos, "exd6");
    expect(ep).not.toBeNull();
    const after = applyMoveDetailed(pos, ep as Move);
    expect(after.enPassant).toBe(true);
    expect(after.captured).toBe("p");
    expect(after.position.board[sq("d5")]).toBeNull();
  });

  it("loses castling rights when the rook is captured", () => {
    const pos = play("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "Rxa8+");
    expect(pos.castling).toEqual({ K: true, Q: false, k: true, q: false });
  });

  it("cannot castle out of or through check", () => {
    const pos = parseFen("r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq - 0 1");
    expect(sansOf(pos)).not.toContain("O-O");
    expect(sansOf(pos)).toContain("O-O-O");
  });

  it("knows stalemate", () => {
    expect(boardState(parseFen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1"))).toBe("stalemate");
  });

  it.each([
    ["K v K", "8/8/4k3/8/8/2K5/8/8 w - - 0 1", true],
    ["K+N v K", "8/8/4k3/8/8/2K5/5N2/8 w - - 0 1", true],
    ["K+B v K+B same colour", "8/8/4k1b1/8/8/2K5/8/5B2 w - - 0 1", true],
    ["K+B v K+B opposite colours", "8/8/4kb2/8/8/2K5/8/5B2 w - - 0 1", false],
    ["K+N v K+N", "8/8/4kn2/8/8/2K5/5N2/8 w - - 0 1", false],
    ["K+P v K", "8/8/4k3/8/8/2K5/5P2/8 w - - 0 1", false],
  ])("insufficient material: %s", (_name, fen, expected) => {
    expect(insufficientMaterial(parseFen(fen))).toBe(expected);
  });

  it("finds a lone king", () => {
    const pos = parseFen("8/8/4k3/8/8/2K5/5P2/8 w - - 0 1");
    expect(hasLoneKing(pos, "b")).toBe(true);
    expect(hasLoneKing(pos, "w")).toBe(false);
  });

  it("repeats the same key after a knight dance", () => {
    const start = parseFen(START_FEN);
    const back = play(START_FEN, "Nf3", "Nf6", "Ng1", "Ng8");
    expect(positionKey(back)).toBe(positionKey(start));
  });
});

describe("bughouse drops", () => {
  const BUG = "4k3/8/8/8/8/8/8/4K3[NPp] w - - 0 1";

  it("drops on any empty square, pawns never on the back ranks", () => {
    const pos = parseFen(BUG, { bughouse: true });
    const drops = legalMoves(pos).filter((m) => m.drop !== undefined);
    const knight = drops.filter((m) => m.drop === "n");
    const pawn = drops.filter((m) => m.drop === "p");
    expect(knight).toHaveLength(62);
    expect(pawn).toHaveLength(48);
  });

  it("can block a check with a drop", () => {
    const pos = parseFen("4k3/8/8/8/8/8/8/r3K3[N] w - - 0 1", { bughouse: true });
    const sans = sansOf(pos);
    expect(sans).toEqual(expect.arrayContaining(["N@b1", "N@c1", "N@d1"]));
    expect(sans).not.toContain("N@e4");
  });

  it("spends the pocket and reports promoted captures as pawns", () => {
    const promotedQueen = parseFen("4k3/8/8/8/8/8/8/3q~K3[N] w - - 0 1", { bughouse: true });
    expect(promotedQueen.promoted).toEqual([sq("d1")]);
    const take = applyMoveDetailed(promotedQueen, { from: sq("e1"), to: sq("d1") });
    expect(take.captured).toBe("p");
    expect(take.position.promoted).toEqual([]);
    const drop = applyMove(promotedQueen, { drop: "n", to: sq("f3") });
    expect(drop.pockets?.w.n).toBe(0);
    expect(drop.board[sq("f3")]).toBe("N");
  });

  it("promotion is tracked in bughouse", () => {
    const pos = parseFen("4k3/P7/8/8/8/8/8/4K3[] w - - 0 1", { bughouse: true });
    const after = applyMove(pos, { from: sq("a7"), to: sq("a8"), promotion: "q" });
    expect(after.promoted).toEqual([sq("a8")]);
    const moved = applyMove(applyMove(after, { from: sq("e8"), to: sq("e7") } as Move), {
      from: sq("a8"),
      to: sq("a1"),
    });
    expect(moved.promoted).toEqual([sq("a1")]);
  });
});
