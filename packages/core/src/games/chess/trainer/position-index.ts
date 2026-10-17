/**
 * Every position of every imported game, searchable by position: which moves
 * were played there, by whom, and how those games ended. Transpositions land
 * on the same entry, because positions are keyed by `positionKey`.
 *
 * Tens of thousands of games make millions of positions, so the index is two
 * typed arrays — a 53-bit hash of each position's key, sorted, beside a packed
 * (game, ply) reference — rather than a map of strings. A hash collision can
 * only add a stray count; callers check a referenced move is legal.
 */
import { applyMove } from "../engine/apply";
import { parseFen, positionKey, START_FEN } from "../engine/fen";
import { legalMoves } from "../engine/movegen";
import type { Color, Position } from "../engine/types";
import { moveToUci, uciToMove } from "../engine/uci";

/** cyrb53: a fast 53-bit string hash (public domain, bryc). */
export function hashKey(text: string): number {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/** A game as the tree builder reads it: its legal UCI moves, from the trainee's side. */
export interface TrainerGame {
  readonly id: string;
  readonly moves: readonly string[];
  readonly result: "win" | "loss" | "draw";
}

/** Plies per game the index (and a tree) looks at. */
export const MAX_PLIES = 120;
const PLY_BITS = 7; // 2^7 = 128 > MAX_PLIES

/**
 * The moves of a UCI line that are legal from the start, stopping at the first
 * one that isn't (stored games are only shape-checked).
 */
export function legalPrefix(uci: string): string[] {
  const out: string[] = [];
  let pos = parseFen(START_FEN);
  for (const text of uci.split(" ")) {
    if (!text) continue;
    const move = uciToMove(text);
    if (!move) break;
    const legal = legalMoves(pos).find((m) => moveToUci(m) === text);
    if (!legal) break;
    out.push(text);
    pos = applyMove(pos, legal);
  }
  return out;
}

export interface MoveStat {
  readonly uci: string;
  readonly games: number;
  /** The trainee's points from those games (win 1, draw ½). */
  readonly score: number;
}

/** A built index as plain data (structured-clonable: kept in IndexedDB between visits). */
export interface PositionIndexData {
  readonly games: readonly TrainerGame[];
  readonly hashes: Float64Array;
  readonly refs: Uint32Array;
}

export class PositionIndex {
  private constructor(
    readonly games: readonly TrainerGame[],
    private readonly hashes: Float64Array,
    private readonly refs: Uint32Array,
  ) {}

  toData(): PositionIndexData {
    return { games: this.games, hashes: this.hashes, refs: this.refs };
  }

  static fromData(data: PositionIndexData): PositionIndex {
    return new PositionIndex(data.games, data.hashes, data.refs);
  }

  /** Stored games' UCI split into moves (the server keeps only legal prefixes). */
  static split(uci: string): string[] {
    return uci.split(" ").filter(Boolean);
  }

  /**
   * Index the trainee's games (all of one colour). Moves past `MAX_PLIES` are
   * not indexed. `onProgress` gets the number of games done.
   */
  static build(games: readonly TrainerGame[], onProgress?: (done: number) => void): PositionIndex {
    const total = games.reduce((n, g) => n + Math.min(g.moves.length, MAX_PLIES), 0);
    const rawHashes = new Float64Array(total);
    const rawRefs = new Uint32Array(total);
    let at = 0;
    games.forEach((game, gi) => {
      let pos: Position = parseFen(START_FEN);
      const plies = Math.min(game.moves.length, MAX_PLIES);
      for (let ply = 0; ply < plies; ply++) {
        rawHashes[at] = hashKey(positionKey(pos));
        rawRefs[at] = (gi << PLY_BITS) | ply;
        at++;
        const move = uciToMove(game.moves[ply] ?? "");
        if (!move) break;
        pos = applyMove(pos, move);
      }
      if (onProgress && gi % 500 === 499) onProgress(gi + 1);
    });
    const order = new Uint32Array(at);
    for (let i = 0; i < at; i++) order[i] = i;
    order.sort((a, b) => (rawHashes[a] ?? 0) - (rawHashes[b] ?? 0));
    const hashes = new Float64Array(at);
    const refs = new Uint32Array(at);
    for (let i = 0; i < at; i++) {
      const from = order[i] ?? 0;
      hashes[i] = rawHashes[from] ?? 0;
      refs[i] = rawRefs[from] ?? 0;
    }
    onProgress?.(games.length);
    return new PositionIndex(games, hashes, refs);
  }

  /** Every (game, ply) at which a game stood in this position, before its move. */
  occurrences(key: string): { game: number; ply: number }[] {
    const h = hashKey(key);
    let lo = 0;
    let hi = this.hashes.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if ((this.hashes[mid] ?? 0) < h) lo = mid + 1;
      else hi = mid;
    }
    const out: { game: number; ply: number }[] = [];
    for (let i = lo; i < this.hashes.length && this.hashes[i] === h; i++) {
      const ref = this.refs[i] ?? 0;
      out.push({ game: ref >>> PLY_BITS, ply: ref & ((1 << PLY_BITS) - 1) });
    }
    return out;
  }

  /** The moves played from this position across all games, most played first. */
  movesFrom(key: string): MoveStat[] {
    const stats = new Map<string, { games: number; score: number }>();
    for (const { game, ply } of this.occurrences(key)) {
      const g = this.games[game];
      const uci = g?.moves[ply];
      if (!g || !uci) continue;
      const s = stats.get(uci) ?? { games: 0, score: 0 };
      s.games++;
      s.score += g.result === "win" ? 1 : g.result === "draw" ? 0.5 : 0;
      stats.set(uci, s);
    }
    return [...stats]
      .map(([uci, s]) => ({ uci, ...s }))
      .sort((a, b) => b.games - a.games || (a.uci < b.uci ? -1 : 1));
  }
}

/** The side the trainee isn't. */
export const otherColor = (c: Color): Color => (c === "w" ? "b" : "w");
