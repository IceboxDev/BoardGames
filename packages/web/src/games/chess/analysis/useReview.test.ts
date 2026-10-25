import { describe, expect, it } from "vitest";
import { type ReviewAction, type ReviewState, reviewReducer } from "./useReview";

const TOTAL = 10;
const run = (
  actions: ReviewAction[],
  from: ReviewState = { ply: TOTAL, line: null, practice: null },
) => actions.reduce((s, a) => reviewReducer(s, a, TOTAL), from);

describe("reviewReducer: browsing and what-if lines", () => {
  it("steps within the game", () => {
    expect(run([{ type: "step", by: 1 }]).ply).toBe(TOTAL);
    expect(
      run([
        { type: "go", ply: 3 },
        { type: "step", by: -1 },
      ]).ply,
    ).toBe(2);
    expect(run([{ type: "go", ply: -4 }]).ply).toBe(0);
  });
  it("plays a side line from the shown position, ← takes it back, leaving drops it", () => {
    const s = run([
      { type: "go", ply: 4 },
      { type: "play", uci: "e2e4" },
      { type: "play", uci: "e7e5" },
    ]);
    expect(s.line).toEqual({ from: 4, moves: ["e2e4", "e7e5"] });
    expect(run([{ type: "step", by: -1 }], s).line?.moves).toEqual(["e2e4"]);
    expect(run([{ type: "undo" }, { type: "undo" }], s).line).toBeNull();
    expect(run([{ type: "leave-line" }], s)).toMatchObject({ ply: 4, line: null });
    expect(run([{ type: "go", ply: 7 }], s)).toMatchObject({ ply: 7, line: null });
  });
});

describe("reviewReducer: learn from your mistakes", () => {
  const start = run([
    { type: "go", ply: 6 },
    { type: "practice", queue: [2, 5] },
  ]);

  it("deals the position before each mistake and locks navigation", () => {
    expect(start.ply).toBe(2);
    expect(
      run(
        [
          { type: "go", ply: 9 },
          { type: "play", uci: "a2a3" },
        ],
        start,
      ),
    ).toEqual(start);
  });
  it("judges a tried move; a miss is taken back, the move shown after two", () => {
    let s = run(
      [
        { type: "try", uci: "a2a3" },
        { type: "answer", verdict: "miss" },
      ],
      start,
    );
    expect(s.practice).toMatchObject({ tried: "a2a3", misses: 1, revealed: false });
    s = run(
      [{ type: "retry" }, { type: "try", uci: "h2h3" }, { type: "answer", verdict: "miss" }],
      s,
    );
    expect(s.practice).toMatchObject({ misses: 2, revealed: true });
    s = run(
      [{ type: "retry" }, { type: "try", uci: "d2d4" }, { type: "answer", verdict: "best" }],
      s,
    );
    expect(s.practice).toMatchObject({ solved: "best", found: [false, false] });
  });
  it("counts a move found before it was shown, moves on, and ends where it began", () => {
    let s = run(
      [{ type: "try", uci: "d2d4" }, { type: "answer", verdict: "keeps" }, { type: "next" }],
      start,
    );
    expect(s.ply).toBe(5);
    expect(s.practice).toMatchObject({ at: 1, found: [true, false], solved: null, misses: 0 });
    s = run([{ type: "next" }], s);
    expect(s.practice?.done).toBe(true);
    expect(run([{ type: "stop-practice" }], s)).toEqual({ ply: 6, line: null, practice: null });
  });
});
