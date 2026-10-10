/**
 * A mutable board for search and playouts — what the AIs and the ownership
 * estimate run on. `board.ts` stays the reference; `fast-board.test.ts` holds
 * the two to the same captures and legality.
 *
 * Layout: a padded `(size + 2)²` grid whose rim is `OFF`, so neighbour loops
 * never bounds-check. Chains are circular next-stone lists with a root, and
 * keep PSEUDO-liberties (one per stone–empty adjacency) with their sum and sum
 * of squares — a chain has exactly one distinct liberty iff
 * `count * sumSq === sum²` (the libEGO trick), which makes atari O(1).
 *
 * Ko is simple ko only: playouts don't need superko, and every move an AI
 * actually plays is checked against the game's own legal list.
 */

import type { Rng } from "../../../lib/rng";
import type { Cell, Color, GoGame } from "../types";

export const F_EMPTY = 0;
export const F_BLACK = 1;
export const F_WHITE = 2;
export const F_OFF = 3;

export class FastBoard {
  readonly size: number;
  /** Padded width: `size + 2`. */
  readonly w: number;
  readonly cells: Int8Array;
  /** Root stone of each stone's chain. */
  readonly root: Int32Array;
  /** Next stone in the chain's circular list. */
  readonly next: Int32Array;
  readonly chainSize: Int32Array;
  readonly libCount: Int32Array;
  readonly libSum: Float64Array;
  readonly libSumSq: Float64Array;
  /** Padded index of every on-board point. */
  readonly points: Int32Array;
  /** The four neighbour offsets. */
  readonly dirs: readonly number[];
  /** Empty points, with `emptyIndex` for O(1) removal. */
  readonly empties: Int32Array;
  readonly emptyIndex: Int32Array;
  emptyCount = 0;
  toMove: Color = 0;
  /** Padded index the side to move may not play (simple ko), or -1. */
  ko = -1;
  /** Stones captured by each colour. */
  captures: [number, number] = [0, 0];
  consecutivePasses = 0;
  lastMove = -1;
  moveCount = 0;

  constructor(size: number) {
    this.size = size;
    this.w = size + 2;
    const n = this.w * this.w;
    this.cells = new Int8Array(n).fill(F_OFF);
    this.root = new Int32Array(n);
    this.next = new Int32Array(n);
    this.chainSize = new Int32Array(n);
    this.libCount = new Int32Array(n);
    this.libSum = new Float64Array(n);
    this.libSumSq = new Float64Array(n);
    this.points = new Int32Array(size * size);
    this.empties = new Int32Array(size * size);
    this.emptyIndex = new Int32Array(n).fill(-1);
    this.dirs = [-this.w, -1, 1, this.w];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const p = (y + 1) * this.w + x + 1;
        this.points[y * size + x] = p;
        this.cells[p] = F_EMPTY;
        this.emptyIndex[p] = this.emptyCount;
        this.empties[this.emptyCount++] = p;
      }
    }
  }

  /** Padded index of game point `point`. */
  pad(point: number): number {
    return (Math.floor(point / this.size) + 1) * this.w + (point % this.size) + 1;
  }

  /** Game point of padded index `p`. */
  unpad(p: number): number {
    return (Math.floor(p / this.w) - 1) * this.size + (p % this.w) - 1;
  }

  static fromGame(game: GoGame): FastBoard {
    const fb = new FastBoard(game.size);
    for (let i = 0; i < game.board.length; i++) {
      const cell = game.board[i] as Cell;
      if (cell !== 0) fb.putStone(fb.pad(i), (cell - 1) as Color);
    }
    fb.toMove = game.toMove;
    fb.captures = [game.captures[0], game.captures[1]];
    fb.consecutivePasses = game.consecutivePasses;
    fb.moveCount = game.moves.length;
    const last = game.moves.at(-1);
    fb.lastMove = last && last.point !== null ? fb.pad(last.point) : -1;
    // Recreate the simple-ko point the last move left, if any.
    if (last && last.point !== null && last.captured.length === 1) {
      const p = fb.pad(last.point);
      const r = fb.root[p] as number;
      if (fb.chainSize[r] === 1 && fb.inAtari(r)) fb.ko = fb.pad(last.captured[0] as number);
    }
    return fb;
  }

  clone(): FastBoard {
    const c = new FastBoard(this.size);
    c.cells.set(this.cells);
    c.root.set(this.root);
    c.next.set(this.next);
    c.chainSize.set(this.chainSize);
    c.libCount.set(this.libCount);
    c.libSum.set(this.libSum);
    c.libSumSq.set(this.libSumSq);
    c.empties.set(this.empties);
    c.emptyIndex.set(this.emptyIndex);
    c.emptyCount = this.emptyCount;
    c.toMove = this.toMove;
    c.ko = this.ko;
    c.captures = [this.captures[0], this.captures[1]];
    c.consecutivePasses = this.consecutivePasses;
    c.lastMove = this.lastMove;
    c.moveCount = this.moveCount;
    return c;
  }

  /** The chain rooted at `r` has exactly one distinct liberty. */
  inAtari(r: number): boolean {
    const n = this.libCount[r] as number;
    if (n === 0) return false;
    const s = this.libSum[r] as number;
    return n * (this.libSumSq[r] as number) === s * s;
  }

  /** The single liberty of a chain in atari. */
  atariLiberty(r: number): number {
    return (this.libSum[r] as number) / (this.libCount[r] as number);
  }

  private addLib(r: number, p: number): void {
    this.libCount[r] = (this.libCount[r] as number) + 1;
    this.libSum[r] = (this.libSum[r] as number) + p;
    this.libSumSq[r] = (this.libSumSq[r] as number) + p * p;
  }

  private removeLib(r: number, p: number): void {
    this.libCount[r] = (this.libCount[r] as number) - 1;
    this.libSum[r] = (this.libSum[r] as number) - p;
    this.libSumSq[r] = (this.libSumSq[r] as number) - p * p;
  }

  private removeEmpty(p: number): void {
    const i = this.emptyIndex[p] as number;
    const lastP = this.empties[--this.emptyCount] as number;
    this.empties[i] = lastP;
    this.emptyIndex[lastP] = i;
    this.emptyIndex[p] = -1;
  }

  private addEmpty(p: number): void {
    this.emptyIndex[p] = this.emptyCount;
    this.empties[this.emptyCount++] = p;
  }

  /** Put a stone, merge chains and fix liberties — no captures, no legality. */
  private putStone(p: number, color: Color): void {
    const stone = color + 1;
    this.cells[p] = stone;
    this.removeEmpty(p);
    this.root[p] = p;
    this.next[p] = p;
    this.chainSize[p] = 1;
    this.libCount[p] = 0;
    this.libSum[p] = 0;
    this.libSumSq[p] = 0;
    for (const d of this.dirs) {
      const q = p + d;
      const c = this.cells[q];
      if (c === F_EMPTY) this.addLib(p, q);
      else if (c === F_BLACK || c === F_WHITE) this.removeLib(this.root[q] as number, p);
    }
    for (const d of this.dirs) {
      const q = p + d;
      if (this.cells[q] === stone) {
        const a = this.root[p] as number;
        const b = this.root[q] as number;
        if (a !== b) this.merge(a, b);
      }
    }
  }

  private merge(a: number, b: number): void {
    // Relabel the smaller chain into the larger.
    let big = a;
    let small = b;
    if ((this.chainSize[a] as number) < (this.chainSize[b] as number)) {
      big = b;
      small = a;
    }
    let s = small;
    do {
      this.root[s] = big;
      s = this.next[s] as number;
    } while (s !== small);
    const t = this.next[big] as number;
    this.next[big] = this.next[small] as number;
    this.next[small] = t;
    this.chainSize[big] = (this.chainSize[big] as number) + (this.chainSize[small] as number);
    this.libCount[big] = (this.libCount[big] as number) + (this.libCount[small] as number);
    this.libSum[big] = (this.libSum[big] as number) + (this.libSum[small] as number);
    this.libSumSq[big] = (this.libSumSq[big] as number) + (this.libSumSq[small] as number);
  }

  private captureChain(r: number): number {
    let count = 0;
    let s = r;
    const stones: number[] = [];
    do {
      stones.push(s);
      s = this.next[s] as number;
    } while (s !== r);
    for (const st of stones) {
      this.cells[st] = F_EMPTY;
      this.addEmpty(st);
      count++;
    }
    for (const st of stones) {
      for (const d of this.dirs) {
        const q = st + d;
        const c = this.cells[q];
        if (c === F_BLACK || c === F_WHITE) this.addLib(this.root[q] as number, st);
      }
    }
    return count;
  }

  /** May the side to move play padded point `p`? (simple ko, no suicide) */
  isLegal(p: number): boolean {
    if (this.cells[p] !== F_EMPTY || p === this.ko) return false;
    const me = this.toMove + 1;
    for (const d of this.dirs) {
      const q = p + d;
      const c = this.cells[q];
      if (c === F_EMPTY) return true;
      if (c === F_OFF) continue;
      const r = this.root[q] as number;
      const atari = this.inAtari(r);
      // Joining a friendly chain with another liberty, or capturing.
      if (c === me ? !atari : atari) return true;
    }
    return false;
  }

  /**
   * Play padded point `p` for the side to move (`-1` passes). The caller has
   * checked `isLegal`. Returns the number of stones captured.
   */
  play(p: number): number {
    const color = this.toMove;
    this.moveCount++;
    this.lastMove = p;
    if (p < 0) {
      this.toMove = (1 - color) as Color;
      this.ko = -1;
      this.consecutivePasses++;
      return 0;
    }
    this.consecutivePasses = 0;
    const enemy = 2 - color;
    this.putStone(p, color);
    let captured = 0;
    let lastCaptured = -1;
    for (const d of this.dirs) {
      const q = p + d;
      if (this.cells[q] === enemy && (this.libCount[this.root[q] as number] as number) === 0) {
        const n = this.captureChain(this.root[q] as number);
        captured += n;
        if (n === 1) lastCaptured = q;
      }
    }
    this.captures[color] += captured;
    const r = this.root[p] as number;
    this.ko = captured === 1 && this.chainSize[r] === 1 && this.inAtari(r) ? lastCaptured : -1;
    this.toMove = (1 - color) as Color;
    return captured;
  }

  /**
   * `p` is a single-point eye of `color`: every neighbour is its stone or the
   * rim, and the diagonals don't make it false (at most one enemy diagonal
   * in the middle, none on the edge).
   */
  isEyeOf(p: number, color: Color): boolean {
    if (this.cells[p] !== F_EMPTY) return false;
    const me = color + 1;
    for (const d of this.dirs) {
      const c = this.cells[p + d];
      if (c !== me && c !== F_OFF) return false;
    }
    const enemy = 2 - color;
    let bad = 0;
    let edge = 0;
    for (const d of [-this.w - 1, -this.w + 1, this.w - 1, this.w + 1]) {
      const c = this.cells[p + d];
      if (c === F_OFF) edge = 1;
      else if (c === enemy) bad++;
    }
    return bad + edge < 2;
  }

  /** Legal moves that don't fill one of the mover's own eyes. */
  sensibleMoves(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.emptyCount; i++) {
      const p = this.empties[i] as number;
      if (this.isLegal(p) && !this.isEyeOf(p, this.toMove)) out.push(p);
    }
    return out;
  }

  /** A uniformly random sensible move, or `-1` (pass) when there is none. */
  randomMove(rng: Rng): number {
    const n = this.emptyCount;
    if (n === 0) return -1;
    const start = Math.floor(rng() * n);
    for (let k = 0; k < n; k++) {
      const p = this.empties[(start + k) % n] as number;
      if (this.isLegal(p) && !this.isEyeOf(p, this.toMove)) return p;
    }
    return -1;
  }

  /**
   * The playout policy: capture a chain the last move left in atari, save an
   * own chain it put in atari, else a random sensible move.
   */
  playoutMove(rng: Rng): number {
    const last = this.lastMove;
    if (last >= 0 && this.cells[last] !== F_EMPTY) {
      const me = this.toMove + 1;
      // The last stone's own chain in atari: capture it.
      const lr = this.root[last] as number;
      if (this.cells[last] !== me && this.inAtari(lr)) {
        const lib = this.atariLiberty(lr);
        if (this.isLegal(lib)) return lib;
      }
      for (const d of this.dirs) {
        const q = last + d;
        if (this.cells[q] !== me) continue;
        const r = this.root[q] as number;
        if (!this.inAtari(r)) continue;
        const lib = this.atariLiberty(r);
        if (this.isLegal(lib) && rng() < 0.9 && this.escapes(lib)) return lib;
      }
    }
    return this.randomMove(rng);
  }

  /** Extending at `p` leaves the mover's new chain with at least two liberties. */
  private escapes(p: number): boolean {
    const me = this.toMove + 1;
    const libs = new Set<number>();
    const seen = new Set<number>();
    for (const d of this.dirs) {
      const q = p + d;
      const c = this.cells[q];
      if (c === F_EMPTY) libs.add(q);
      else if (c === me) {
        const r = this.root[q] as number;
        if (seen.has(r)) continue;
        seen.add(r);
        let s = r;
        do {
          for (const e of this.dirs)
            if (this.cells[s + e] === F_EMPTY && s + e !== p) libs.add(s + e);
          s = this.next[s] as number;
        } while (s !== r && libs.size < 2);
      }
      if (libs.size >= 2) return true;
    }
    return libs.size >= 2;
  }

  /**
   * Area score at the end of a playout, from Black's side: stones plus empty
   * points whose neighbours are all one colour. `bonus` is White's komi plus
   * handicap compensation.
   */
  playoutScore(bonus: number): number {
    let score = -bonus;
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i] as number;
      const c = this.cells[p];
      if (c === F_BLACK) score++;
      else if (c === F_WHITE) score--;
      else {
        let b = false;
        let w = false;
        for (const d of this.dirs) {
          const n = this.cells[p + d];
          if (n === F_BLACK) b = true;
          else if (n === F_WHITE) w = true;
        }
        if (b && !w) score++;
        else if (w && !b) score--;
      }
    }
    return score;
  }

  /** Owner of every game point after a playout: +1 black, -1 white, 0 neither. */
  ownershipInto(acc: Float64Array): void {
    for (let i = 0; i < this.points.length; i++) {
      const p = this.points[i] as number;
      const c = this.cells[p];
      if (c === F_BLACK) acc[i] = (acc[i] as number) + 1;
      else if (c === F_WHITE) acc[i] = (acc[i] as number) - 1;
      else {
        let b = false;
        let w = false;
        for (const d of this.dirs) {
          const n = this.cells[p + d];
          if (n === F_BLACK) b = true;
          else if (n === F_WHITE) w = true;
        }
        if (b && !w) acc[i] = (acc[i] as number) + 1;
        else if (w && !b) acc[i] = (acc[i] as number) - 1;
      }
    }
  }

  /** Play random moves until two passes or `maxMoves`. */
  playout(rng: Rng, maxMoves: number, onMove?: (p: number, color: Color) => void): void {
    let n = 0;
    while (this.consecutivePasses < 2 && n < maxMoves) {
      const color = this.toMove;
      const p = this.playoutMove(rng);
      this.play(p);
      if (p >= 0) onMove?.(p, color);
      n++;
    }
  }
}
