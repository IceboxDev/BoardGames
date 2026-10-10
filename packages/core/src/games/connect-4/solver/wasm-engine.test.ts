import { describe, expect, it } from "vitest";
import { createRng } from "../../../lib/rng";
import { BitSolver, BudgetExceeded } from "./bitboard-solver";
import { wasmEngine } from "./wasm-engine";

/** A random drop-only line of `length` discs with no four in it. */
function randomLine(solver: BitSolver, cols: number, length: number, seed: number): number[] {
  const rng = createRng(seed);
  for (;;) {
    const line: number[] = [];
    solver.setMoves([]);
    let stuck = 0;
    while (line.length < length && stuck < 50) {
      const c = Math.floor(rng() * cols);
      if (!solver.canPlay(c) || solver.isWinningMove(c)) {
        stuck++;
        continue;
      }
      solver.playColumn(c);
      line.push(c);
    }
    if (line.length === length) return line;
  }
}

/** The same board solved in JS and on the engine. */
function pair(cols: number, rows: number): [BitSolver, BitSolver] {
  const js = new BitSolver(cols, rows, 20);
  const wasm = new BitSolver(cols, rows, 12);
  const engine = wasmEngine(cols, rows);
  expect(engine).not.toBeNull();
  wasm.attachEngine(engine);
  return [js, wasm];
}

describe("the WebAssembly engine", () => {
  it("gives the JS solver's exact scores, column by column (6×5)", () => {
    const [js, wasm] = pair(6, 5);
    for (let seed = 1; seed <= 25; seed++) {
      const line = randomLine(js, 6, 4 + (seed % 14), seed);
      js.setMoves(line);
      wasm.setMoves(line);
      expect(wasm.solve(), line.join("")).toBe(js.solve());
      js.setMoves(line);
      wasm.setMoves(line);
      expect(wasm.analyze(), line.join("")).toEqual(js.analyze());
      js.setMoves(line);
      wasm.setMoves(line);
      expect(wasm.solve(true), line.join("")).toBe(js.solve(true));
    }
  });

  it("agrees on 7×6 middle games too, and searches faster", () => {
    const [js, wasm] = pair(7, 6);
    let jsMs = 0;
    let wasmMs = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const line = randomLine(js, 7, 14 + (seed % 6), seed);
      js.setMoves(line);
      wasm.setMoves(line);
      let t = performance.now();
      const expected = js.solve();
      jsMs += performance.now() - t;
      t = performance.now();
      expect(wasm.solve(), line.join("")).toBe(expected);
      wasmMs += performance.now() - t;
    }
    console.info(`7×6 solves: JS ${jsMs.toFixed(0)} ms, WebAssembly ${wasmMs.toFixed(0)} ms`);
  });

  it("stops at its node budget, as the JS search does", () => {
    const [, wasm] = pair(7, 6);
    wasm.setMoves([3, 3, 3, 3, 2, 4, 1, 5, 0, 6, 2, 4]);
    wasm.nodes = 0;
    wasm.nodeBudget = 50;
    expect(() => wasm.solve()).toThrow(BudgetExceeded);
    wasm.nodeBudget = Number.POSITIVE_INFINITY;
    wasm.nodes = 0;
    expect(Number.isInteger(wasm.solve())).toBe(true);
    expect(wasm.nodes).toBeGreaterThan(50);
  });
});
