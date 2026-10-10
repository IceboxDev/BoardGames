/**
 * An exact Connect 4 solver for drop-only play, after Pascal Pons'
 * (http://blog.gamesolver.org): a bitboard of `(rows + 1) * cols ≤ 64` bits,
 * negamax with alpha-beta, a null-window search narrowing on the score,
 * only non-losing moves searched, moves ordered by the threats they create,
 * and a transposition table. JS has no 64-bit integers, so every bitboard is a
 * pair of 32-bit halves (`lo` = bits 0–31, `hi` = bits 32–63).
 *
 * Scores are Pons': from the side to move, positive = a win, larger = sooner.
 * Score `s > 0` means the side to move wins with its `(cells / 2 + 1 - s)`-th
 * disc; `0` a draw; negative the mirror image.
 */

import type { Board, Seat } from "../types";
import type { SearchEngine } from "./wasm-engine";

export class BudgetExceeded extends Error {
  constructor() {
    super("Connect 4 solver node budget exceeded");
  }
}

/** A precomputed answer for early positions: the score, or `undefined`. */
export type BookLookup = (
  keyLo: number,
  keyHi: number,
  mirroredLo: number,
  mirroredHi: number,
  moves: number,
) => number | undefined;

function popcount(x: number): number {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  x = (x + (x >>> 4)) & 0x0f0f0f0f;
  return Math.imul(x, 0x01010101) >>> 24;
}

export class BitSolver {
  readonly cols: number;
  readonly rows: number;
  private readonly stride: number;
  readonly minScore: number;
  readonly maxScore: number;
  private readonly cells: number;

  private readonly bottomLo: number;
  private readonly bottomHi: number;
  private readonly boardLo: number;
  private readonly boardHi: number;
  private readonly colLo: Int32Array;
  private readonly colHi: Int32Array;
  /** Columns, centre first. */
  readonly order: number[];

  // Transposition table: exact 64-bit keys, Pons' bound encoding in `ttVal`.
  private readonly ttBits: number;
  private readonly ttLo: Int32Array;
  private readonly ttHi: Int32Array;
  private readonly ttVal: Int8Array;

  // Per-ply move-sorter scratch.
  private readonly sortLo: Int32Array;
  private readonly sortHi: Int32Array;
  private readonly sortScore: Int32Array;

  /** Scratch return for 64-bit helpers. */
  private rl = 0;
  private rh = 0;

  nodes = 0;
  nodeBudget = Number.POSITIVE_INFINITY;
  private book: BookLookup | null = null;
  /** The deepest position the book covers; -1 = no book. */
  private bookMaxMoves = -1;
  /** Searches past the book run here when attached (the WebAssembly engine). */
  private engine: SearchEngine | null = null;

  constructor(cols: number, rows: number, ttBits = 22) {
    if ((rows + 1) * cols > 64) throw new Error(`A ${cols}×${rows} board does not fit 64 bits`);
    this.cols = cols;
    this.rows = rows;
    this.stride = rows + 1;
    this.cells = cols * rows;
    this.minScore = -(this.cells >> 1) + 3;
    this.maxScore = ((this.cells + 1) >> 1) - 3;
    let bLo = 0;
    let bHi = 0;
    let fLo = 0;
    let fHi = 0;
    this.colLo = new Int32Array(cols);
    this.colHi = new Int32Array(cols);
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r <= rows; r++) {
        const bit = c * this.stride + r;
        const isLo = bit < 32;
        const v = 1 << (bit & 31);
        if (r < rows) {
          if (isLo) {
            fLo |= v;
            this.colLo[c] |= v;
          } else {
            fHi |= v;
            this.colHi[c] |= v;
          }
        }
        if (r === 0) {
          if (isLo) bLo |= v;
          else bHi |= v;
        }
      }
    }
    this.bottomLo = bLo;
    this.bottomHi = bHi;
    this.boardLo = fLo;
    this.boardHi = fHi;
    this.order = Array.from({ length: cols }, (_, c) => c).sort(
      (a, b) => Math.abs(a - (cols - 1) / 2) - Math.abs(b - (cols - 1) / 2) || a - b,
    );
    this.ttBits = ttBits;
    this.ttLo = new Int32Array(1 << ttBits);
    this.ttHi = new Int32Array(1 << ttBits);
    this.ttVal = new Int8Array(1 << ttBits);
    const depth = this.cells + 1;
    this.sortLo = new Int32Array(depth * cols);
    this.sortHi = new Int32Array(depth * cols);
    this.sortScore = new Int32Array(depth * cols);
  }

  // ── Position ──────────────────────────────────────────────────────────────

  /** The side to move's discs, every disc, and the disc count. */
  posLo = 0;
  posHi = 0;
  maskLo = 0;
  maskHi = 0;
  moves = 0;

  /** Load a board with `toMove` to play. */
  setBoard(board: Board, toMove: Seat): void {
    this.posLo = 0;
    this.posHi = 0;
    this.maskLo = 0;
    this.maskHi = 0;
    this.moves = 0;
    for (let c = 0; c < this.cols; c++) {
      for (let r = 0; r < this.rows; r++) {
        const who = board[c][r];
        if (who === null) break;
        const bit = c * this.stride + r;
        const v = 1 << (bit & 31);
        if (bit < 32) {
          this.maskLo |= v;
          if (who === toMove) this.posLo |= v;
        } else {
          this.maskHi |= v;
          if (who === toMove) this.posHi |= v;
        }
        this.moves++;
      }
    }
  }

  /** Load the position reached by dropping in `columns` in turn from empty. */
  setMoves(columns: readonly number[]): void {
    this.posLo = 0;
    this.posHi = 0;
    this.maskLo = 0;
    this.maskHi = 0;
    this.moves = 0;
    for (const c of columns) {
      if (!this.canPlay(c)) throw new Error(`Column ${c} is full`);
      this.playColumn(c);
    }
  }

  canPlay(column: number): boolean {
    return (
      (this.maskLo & this.colLo[column]) !== this.colLo[column] ||
      (this.maskHi & this.colHi[column]) !== this.colHi[column]
    );
  }

  /** Does dropping in `column` win at once for the side to move? */
  isWinningMove(column: number): boolean {
    this.possible(this.maskLo, this.maskHi);
    const pl = this.rl & this.colLo[column];
    const ph = this.rh & this.colHi[column];
    this.winning(this.posLo, this.posHi, this.maskLo, this.maskHi);
    return ((this.rl & pl) | (this.rh & ph)) !== 0;
  }

  playColumn(column: number): void {
    this.possible(this.maskLo, this.maskHi);
    const ml = this.rl & this.colLo[column];
    const mh = this.rh & this.colHi[column];
    this.posLo ^= this.maskLo;
    this.posHi ^= this.maskHi;
    this.maskLo |= ml;
    this.maskHi |= mh;
    this.moves++;
  }

  /** Position key (`pos + mask`, unique per position) and its mirror image's. */
  key(): { lo: number; hi: number; mirrorLo: number; mirrorHi: number } {
    this.add(this.posLo, this.posHi, this.maskLo, this.maskHi);
    const lo = this.rl;
    const hi = this.rh;
    const [mpl, mph] = this.mirror(this.posLo, this.posHi);
    const [mml, mmh] = this.mirror(this.maskLo, this.maskHi);
    this.add(mpl, mph, mml, mmh);
    return { lo, hi, mirrorLo: this.rl, mirrorHi: this.rh };
  }

  private mirror(lo: number, hi: number): [number, number] {
    let ol = 0;
    let oh = 0;
    for (let c = 0; c < this.cols; c++) {
      const target = this.cols - 1 - c;
      for (let r = 0; r < this.stride; r++) {
        const from = c * this.stride + r;
        const set = from < 32 ? (lo >>> from) & 1 : (hi >>> (from - 32)) & 1;
        if (!set) continue;
        const to = target * this.stride + r;
        if (to < 32) ol |= 1 << to;
        else oh |= 1 << (to - 32);
      }
    }
    return [ol, oh];
  }

  // ── 64-bit helpers (results in rl / rh) ───────────────────────────────────

  private add(aLo: number, aHi: number, bLo: number, bHi: number): void {
    const lo = (aLo >>> 0) + (bLo >>> 0);
    this.rl = lo | 0;
    this.rh = (aHi + bHi + (lo > 0xffffffff ? 1 : 0)) | 0;
  }

  /** Cells a disc could be dropped into: `(mask + bottom) & board`. */
  private possible(mLo: number, mHi: number): void {
    this.add(mLo, mHi, this.bottomLo, this.bottomHi);
    this.rl &= this.boardLo;
    this.rh &= this.boardHi;
  }

  /** Empty cells that would complete four for the discs `p`. */
  private winning(pL: number, pH: number, mL: number, mH: number): void {
    // Vertical.
    let rl = (pL << 1) & (pL << 2) & (pL << 3);
    let rh = ((pH << 1) | (pL >>> 31)) & ((pH << 2) | (pL >>> 30)) & ((pH << 3) | (pL >>> 29));
    const s = this.stride;
    for (let k = 0; k < 3; k++) {
      const d = k === 0 ? s : k === 1 ? s - 1 : s + 1;
      const d2 = 2 * d;
      const d3 = 3 * d;
      const l1L = pL << d;
      const l1H = (pH << d) | (pL >>> (32 - d));
      const l2L = pL << d2;
      const l2H = (pH << d2) | (pL >>> (32 - d2));
      const l3L = pL << d3;
      const l3H = (pH << d3) | (pL >>> (32 - d3));
      const r1L = (pL >>> d) | (pH << (32 - d));
      const r1H = pH >>> d;
      const r2L = (pL >>> d2) | (pH << (32 - d2));
      const r2H = pH >>> d2;
      const r3L = (pL >>> d3) | (pH << (32 - d3));
      const r3H = pH >>> d3;
      let aL = l1L & l2L;
      let aH = l1H & l2H;
      rl |= (aL & l3L) | (aL & r1L);
      rh |= (aH & l3H) | (aH & r1H);
      aL = r1L & r2L;
      aH = r1H & r2H;
      rl |= (aL & l1L) | (aL & r3L);
      rh |= (aH & l1H) | (aH & r3H);
    }
    this.rl = rl & (this.boardLo ^ mL);
    this.rh = rh & (this.boardHi ^ mH);
  }

  /** Moves that don't hand the opponent an immediate win (0 if every move loses). */
  private nonLosing(pL: number, pH: number, mL: number, mH: number): void {
    this.possible(mL, mH);
    let possL = this.rl;
    let possH = this.rh;
    this.winning(pL ^ mL, pH ^ mH, mL, mH);
    const oppL = this.rl;
    const oppH = this.rh;
    const forcedL = possL & oppL;
    const forcedH = possH & oppH;
    if ((forcedL | forcedH) !== 0) {
      if (popcount(forcedL) + popcount(forcedH) > 1) {
        this.rl = 0;
        this.rh = 0;
        return;
      }
      possL = forcedL;
      possH = forcedH;
    }
    // Never play directly beneath an opponent's winning cell.
    const belowL = (oppL >>> 1) | (oppH << 31);
    const belowH = oppH >>> 1;
    this.rl = possL & ~belowL;
    this.rh = possH & ~belowH;
  }

  // ── Search ────────────────────────────────────────────────────────────────

  private ttIndex(kLo: number, kHi: number): number {
    return (
      (Math.imul(kLo, 0x9e3779b1) ^ Math.imul(kHi ^ (kLo >>> 16), 0x85ebca77)) >>>
      (32 - this.ttBits)
    );
  }

  private negamax(
    pL: number,
    pH: number,
    mL: number,
    mH: number,
    nb: number,
    alpha: number,
    beta: number,
  ): number {
    if (++this.nodes > this.nodeBudget) throw new BudgetExceeded();
    this.nonLosing(pL, pH, mL, mH);
    const nextL = this.rl;
    const nextH = this.rh;
    const cells = this.cells;
    if ((nextL | nextH) === 0) return -((cells - nb) >> 1);
    if (nb >= cells - 2) return 0;

    let min = -((cells - 2 - nb) >> 1);
    if (alpha < min) {
      alpha = min;
      if (alpha >= beta) return alpha;
    }
    let max = (cells - 1 - nb) >> 1;

    this.add(pL, pH, mL, mH);
    const kLo = this.rl;
    const kHi = this.rh;
    const idx = this.ttIndex(kLo, kHi);
    if (this.ttLo[idx] === kLo && this.ttHi[idx] === kHi) {
      const val = this.ttVal[idx];
      if (val !== 0) {
        if (val > this.maxScore - this.minScore + 1) {
          min = val + 2 * this.minScore - this.maxScore - 2;
          if (alpha < min) {
            alpha = min;
            if (alpha >= beta) return alpha;
          }
        } else {
          max = val + this.minScore - 1;
          if (beta > max) {
            beta = max;
            if (alpha >= beta) return beta;
          }
        }
      }
    }

    if (nb <= this.bookMaxMoves) {
      const known = this.lookupBook(pL, pH, mL, mH, nb);
      if (known !== undefined) return known;
    }

    // Collect and sort moves: most new threats first, centre first on ties.
    const base = nb * this.cols;
    let n = 0;
    for (let i = this.cols - 1; i >= 0; i--) {
      const c = this.order[i];
      const mvL = nextL & this.colLo[c];
      const mvH = nextH & this.colHi[c];
      if ((mvL | mvH) === 0) continue;
      this.winning(pL | mvL, pH | mvH, mL, mH);
      const score = popcount(this.rl) + popcount(this.rh);
      // Insertion sort, ties go after earlier (outer) columns → centre ends up first.
      let j = n++;
      while (j > 0 && this.sortScore[base + j - 1] > score) {
        this.sortLo[base + j] = this.sortLo[base + j - 1];
        this.sortHi[base + j] = this.sortHi[base + j - 1];
        this.sortScore[base + j] = this.sortScore[base + j - 1];
        j--;
      }
      this.sortLo[base + j] = mvL;
      this.sortHi[base + j] = mvH;
      this.sortScore[base + j] = score;
    }

    for (let i = n - 1; i >= 0; i--) {
      const mvL = this.sortLo[base + i];
      const mvH = this.sortHi[base + i];
      // Play: the opponent's discs become "the side to move's".
      const score = -this.negamax(pL ^ mL, pH ^ mH, mL | mvL, mH | mvH, nb + 1, -beta, -alpha);
      if (score >= beta) {
        this.ttStore(idx, kLo, kHi, score + this.maxScore - 2 * this.minScore + 2);
        return score;
      }
      if (score > alpha) alpha = score;
    }
    this.ttStore(idx, kLo, kHi, alpha - this.minScore + 1);
    return alpha;
  }

  private ttStore(idx: number, kLo: number, kHi: number, val: number): void {
    this.ttLo[idx] = kLo;
    this.ttHi[idx] = kHi;
    this.ttVal[idx] = val;
  }

  /**
   * Search with `engine` (the C solver as WebAssembly: same answers, about
   * twice as fast) from positions past the book; null: search in JS.
   */
  attachEngine(engine: SearchEngine | null): void {
    this.engine = engine;
  }

  get hasEngine(): boolean {
    return this.engine !== null;
  }

  /**
   * `negamax` from a root: past the book, on the engine if there is one
   * (deeper nodes only add discs, so the book is never needed there).
   */
  private search(nb: number, alpha: number, beta: number): number {
    const engine = this.engine;
    if (engine === null || nb <= this.bookMaxMoves) {
      return this.negamax(this.posLo, this.posHi, this.maskLo, this.maskHi, nb, alpha, beta);
    }
    const left = this.nodeBudget - this.nodes;
    if (left < 0) throw new BudgetExceeded();
    const score = engine.negamax(
      this.posLo | 0,
      this.posHi | 0,
      this.maskLo | 0,
      this.maskHi | 0,
      nb,
      alpha,
      beta,
      left,
    );
    this.nodes += engine.nodes();
    if (score === null) throw new BudgetExceeded();
    return score;
  }

  /** Answer positions up to `maxMoves` discs from `book` (null: search everything). */
  attachBook(book: BookLookup | null, maxMoves: number): void {
    this.book = book;
    this.bookMaxMoves = book === null ? -1 : maxMoves;
  }

  private lookupBook(
    pL: number,
    pH: number,
    mL: number,
    mH: number,
    nb: number,
  ): number | undefined {
    if (this.book === null) return undefined;
    this.add(pL, pH, mL, mH);
    const lo = this.rl;
    const hi = this.rh;
    const [mpl, mph] = this.mirror(pL, pH);
    const [mml, mmh] = this.mirror(mL, mH);
    this.add(mpl, mph, mml, mmh);
    return this.book(lo, hi, this.rl, this.rh, nb);
  }

  /** Can the side to move win with its next disc? */
  canWinNext(): boolean {
    this.winning(this.posLo, this.posHi, this.maskLo, this.maskHi);
    const wl = this.rl;
    const wh = this.rh;
    this.possible(this.maskLo, this.maskHi);
    return ((wl & this.rl) | (wh & this.rh)) !== 0;
  }

  /**
   * The exact score of the loaded position (side to move's view). `weak` only
   * tells win / draw / loss (+1 / 0 / -1), much faster.
   */
  solve(weak = false): number {
    const nb = this.moves;
    if (this.canWinNext()) return (this.cells + 1 - nb) >> 1;
    if (nb >= this.cells) return 0;
    let min = -((this.cells - nb) >> 1);
    let max = (this.cells + 1 - nb) >> 1;
    if (weak) {
      min = -1;
      max = 1;
    }
    while (min < max) {
      let med = min + Math.trunc((max - min) / 2);
      if (med <= 0 && Math.trunc(min / 2) < med) med = Math.trunc(min / 2);
      else if (med >= 0 && Math.trunc(max / 2) > med) med = Math.trunc(max / 2);
      const r = this.search(nb, med, med + 1);
      if (r <= med) max = r;
      else min = r;
    }
    return min | 0; // never -0
  }

  /**
   * The exact score of dropping in each column (side to move's view), `null`
   * for a full column.
   */
  analyze(weak = false): (number | null)[] {
    const out: (number | null)[] = [];
    const saved = [this.posLo, this.posHi, this.maskLo, this.maskHi, this.moves] as const;
    for (let c = 0; c < this.cols; c++) {
      if (!this.canPlay(c)) {
        out.push(null);
        continue;
      }
      if (this.isWinningMove(c)) {
        out.push(weak ? 1 : (this.cells + 1 - this.moves) >> 1);
        continue;
      }
      this.playColumn(c);
      try {
        const score = this.moves >= this.cells ? 0 : -this.solve(weak);
        out.push((weak ? Math.sign(score) : score) | 0);
      } finally {
        [this.posLo, this.posHi, this.maskLo, this.maskHi, this.moves] = saved;
      }
    }
    return out;
  }

  /**
   * The columns that keep the loaded position's `score` (side to move's
   * view, from `solve(weak)`): one null-window test per column instead of a
   * full solve each, so it costs a fraction of `analyze`. With `weak`, the
   * columns that keep the result class (win / draw); in a weakly lost
   * position every playable column is returned, since none can be told apart.
   */
  bestColumns(score: number, weak = false): number[] {
    if (!weak) return this.columnsReaching(score);
    const out: number[] = [];
    const saved = [this.posLo, this.posHi, this.maskLo, this.maskHi, this.moves] as const;
    for (const c of this.order) {
      if (!this.canPlay(c)) continue;
      if (this.isWinningMove(c)) {
        if (score === 1) out.push(c);
        continue;
      }
      if (score < 0) {
        out.push(c);
        continue;
      }
      this.playColumn(c);
      try {
        if (this.childKeeps(Math.sign(score), true)) out.push(c);
      } finally {
        [this.posLo, this.posHi, this.maskLo, this.maskHi, this.moves] = saved;
      }
    }
    return out.sort((a, b) => a - b);
  }

  /**
   * The columns whose move scores at least `target` (the side to move's view,
   * `solve`'s scale): one null-window test per column. With the position's
   * own score, the best columns; one below it, those a disc slower too.
   */
  columnsReaching(target: number): number[] {
    const out: number[] = [];
    const saved = [this.posLo, this.posHi, this.maskLo, this.maskHi, this.moves] as const;
    const win = (this.cells + 1 - this.moves) >> 1;
    for (const c of this.order) {
      if (!this.canPlay(c)) continue;
      if (this.isWinningMove(c)) {
        if (win >= target) out.push(c);
        continue;
      }
      this.playColumn(c);
      try {
        if (this.childKeeps(target, false)) out.push(c);
      } finally {
        [this.posLo, this.posHi, this.maskLo, this.maskHi, this.moves] = saved;
      }
    }
    return out.sort((a, b) => a - b);
  }

  /** After a move: does the parent's side still reach `target` (its view)? */
  private childKeeps(target: number, weak: boolean): boolean {
    const nb = this.moves;
    // The child's side to move is the parent's opponent: we need its score ≤ -target.
    if (nb >= this.cells) return 0 >= target;
    if (this.canWinNext()) return -(weak ? 1 : (this.cells + 1 - nb) >> 1) >= target;
    const bound = -target;
    return this.search(nb, bound, bound + 1) <= bound;
  }

  /** Forget everything the table learned (between unrelated searches it can stay). */
  clearTable(): void {
    this.ttVal.fill(0);
    this.engine?.clear();
  }
}

/**
 * How many more discs the winner places: score `s` (side to move's view, at
 * `moves` discs played) → the side that wins does so with its `n`-th disc
 * from now. `null` for a draw.
 */
export function discsToWin(score: number, cells: number, moves: number): number | null {
  if (score === 0) return null;
  const winnerTotal = cells / 2 + 1 - Math.abs(score);
  // The side to move has placed ⌊moves/2⌋ discs (it moves on even counts);
  // its opponent ⌈moves/2⌉.
  const toMoveDiscs = moves >> 1;
  const oppDiscs = moves - toMoveDiscs;
  return score > 0 ? winnerTotal - toMoveDiscs : winnerTotal - oppDiscs;
}
