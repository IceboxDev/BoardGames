/**
 * A mutable, allocation-free board for the AI's search: drop / pop with undo,
 * win detection, and a static evaluation. Mirrors `rules.ts` exactly (a parity
 * test plays both side by side) but ignores the repetition draw.
 */

import { columnHeight } from "../rules";
import type { GameState, Seat } from "../types";

export const EMPTY = -1;
/** A win's base score; the search subtracts the ply so faster wins rank higher. */
export const WIN_SCORE = 1_000_000;

export class SearchBoard {
  readonly cols: number;
  readonly rows: number;
  readonly popOut: boolean;
  /** `cells[column * rows + row]`: EMPTY, 0 or 1. */
  readonly cells: Int8Array;
  readonly heights: Int8Array;
  toMove: Seat;
  /** Disc moves played since the root. */
  ply = 0;
  /** Every window of four cells, flattened (4 indices each). */
  private readonly windows: Int32Array;
  /** Columns, centre first. */
  readonly order: number[];

  constructor(cols: number, rows: number, popOut: boolean, toMove: Seat) {
    this.cols = cols;
    this.rows = rows;
    this.popOut = popOut;
    this.cells = new Int8Array(cols * rows).fill(EMPTY);
    this.heights = new Int8Array(cols);
    this.toMove = toMove;
    this.windows = buildWindows(cols, rows);
    this.order = Array.from({ length: cols }, (_, c) => c).sort(
      (a, b) => Math.abs(a - (cols - 1) / 2) - Math.abs(b - (cols - 1) / 2) || a - b,
    );
  }

  static fromState(state: GameState): SearchBoard {
    const b = new SearchBoard(state.cols, state.rows, state.config.popOut, state.currentPlayer);
    for (let c = 0; c < state.cols; c++) {
      const h = columnHeight(state.board, c);
      b.heights[c] = h;
      for (let r = 0; r < h; r++) b.cells[c * state.rows + r] = state.board[c][r] as Seat;
    }
    return b;
  }

  /**
   * Fill `out` with the side to move's disc moves, centre columns first:
   * `column` is a drop, `cols + column` a pop. Returns the count.
   */
  moves(out: Int32Array | number[]): number {
    let n = 0;
    for (const c of this.order) if (this.heights[c] < this.rows) out[n++] = c;
    if (this.popOut) {
      for (const c of this.order) {
        if (this.heights[c] > 0 && this.cells[c * this.rows] === this.toMove) {
          out[n++] = this.cols + c;
        }
      }
    }
    return n;
  }

  /**
   * Play a move for the side to move. Returns the seat that has won because of
   * it (a pop can complete the opponent's four — and the popper wins a pop that
   * completes both), or EMPTY.
   */
  play(move: number): number {
    const mover = this.toMove;
    this.toMove = mover === 0 ? 1 : 0;
    this.ply++;
    if (move < this.cols) {
      const r = this.heights[move]++;
      this.cells[move * this.rows + r] = mover;
      return this.fourThrough(move, r) ? mover : EMPTY;
    }
    const c = move - this.cols;
    const base = c * this.rows;
    const h = this.heights[c];
    for (let r = 0; r < h - 1; r++) this.cells[base + r] = this.cells[base + r + 1];
    this.cells[base + h - 1] = EMPTY;
    this.heights[c] = h - 1;
    let oppWins = false;
    for (let r = 0; r < h - 1; r++) {
      if (this.fourThrough(c, r)) {
        if (this.cells[base + r] === mover) return mover;
        oppWins = true;
      }
    }
    return oppWins ? this.toMove : EMPTY;
  }

  undo(move: number): void {
    this.toMove = this.toMove === 0 ? 1 : 0;
    this.ply--;
    if (move < this.cols) {
      const r = --this.heights[move];
      this.cells[move * this.rows + r] = EMPTY;
      return;
    }
    const c = move - this.cols;
    const base = c * this.rows;
    const h = this.heights[c];
    for (let r = h; r > 0; r--) this.cells[base + r] = this.cells[base + r - 1];
    this.cells[base] = this.toMove;
    this.heights[c] = h + 1;
  }

  /** Does the disc at (c, r) sit in a run of four or more? */
  fourThrough(c: number, r: number): boolean {
    const who = this.cells[c * this.rows + r];
    if (who === EMPTY) return false;
    return (
      this.run(c, r, 1, 0, who) + this.run(c, r, -1, 0, who) >= 3 ||
      this.run(c, r, 1, 1, who) + this.run(c, r, -1, -1, who) >= 3 ||
      this.run(c, r, 1, -1, who) + this.run(c, r, -1, 1, who) >= 3 ||
      // Up as well as down: after a pop a disc can have its run above it.
      this.run(c, r, 0, 1, who) + this.run(c, r, 0, -1, who) >= 3
    );
  }

  private run(c: number, r: number, dc: number, dr: number, who: number): number {
    let n = 0;
    let x = c + dc;
    let y = r + dr;
    while (
      x >= 0 &&
      x < this.cols &&
      y >= 0 &&
      y < this.rows &&
      this.cells[x * this.rows + y] === who
    ) {
      n++;
      x += dc;
      y += dr;
    }
    return n;
  }

  /** Static evaluation for the side to move: open windows weighted by how full they are. */
  evaluate(): number {
    const me = this.toMove;
    let score = 0;
    const w = this.windows;
    for (let i = 0; i < w.length; i += 4) {
      let mine = 0;
      let theirs = 0;
      for (let k = 0; k < 4; k++) {
        const v = this.cells[w[i + k]];
        if (v === me) mine++;
        else if (v !== EMPTY) theirs++;
      }
      if (theirs === 0) score += WEIGHTS[mine];
      else if (mine === 0) score -= WEIGHTS[theirs];
    }
    const centre = (this.cols - 1) / 2;
    for (let c = 0; c < this.cols; c++) {
      const bonus = Math.max(0, 3 - Math.floor(Math.abs(c - centre)));
      if (bonus === 0) continue;
      for (let r = 0; r < this.heights[c]; r++) {
        score += this.cells[c * this.rows + r] === me ? bonus : -bonus;
      }
    }
    return score;
  }
}

const WEIGHTS = [0, 1, 6, 40, 0];

function buildWindows(cols: number, rows: number): Int32Array {
  const out: number[] = [];
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      for (const [dc, dr] of [
        [1, 0],
        [0, 1],
        [1, 1],
        [1, -1],
      ]) {
        const ec = c + 3 * dc;
        const er = r + 3 * dr;
        if (ec < 0 || ec >= cols || er < 0 || er >= rows) continue;
        for (let k = 0; k < 4; k++) out.push((c + k * dc) * rows + (r + k * dr));
      }
    }
  }
  return Int32Array.from(out);
}
