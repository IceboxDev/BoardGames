/**
 * Opening books: the exact score of every drop-only position up to
 * `maxMoves` discs on a board, so the solver answers the opening — where a
 * search takes seconds to minutes — at once. Built offline by
 * `pnpm --filter @boardgames/core c4-book` (build-book.ts).
 *
 * Storage is a perfect hash over the book's positions (CHD: "hash, displace
 * and compress"): a key picks a bucket, the bucket's displacement picks the
 * key's slot, and every slot holds a 10-bit fingerprint and a 6-bit score —
 * two bytes a position, no keys stored. The book is *complete*: it holds
 * every position (one of each mirror pair) reachable by drops that don't
 * win, and the solver only ever asks about such positions, so a lookup never
 * lands on another position's slot; the fingerprint is the guard against a
 * caller that breaks that rule.
 *
 * Books are base64 modules (`books/<cols>x<rows>.gen.ts`) loaded on demand —
 * `loadOpeningBook` — so the server bundle, its worker threads and the
 * browser's solver worker read them the same way, and a page that never
 * solves never downloads one.
 */

import type { BookLookup } from "./bitboard-solver";

/** A generated book module's payload. */
export interface BookData {
  /** Format of `data`; bump when the layout changes. */
  format: 2;
  cols: number;
  rows: number;
  /** Positions with up to this many discs are in the book. */
  maxMoves: number;
  buckets: number;
  slots: number;
  /** base64 of `buckets` u16 displacements, then `slots` u16 entries (little-endian). */
  data: string;
}

/** An empty slot (a score code no board reaches: scores stay within ±25). */
export const EMPTY_SLOT = 0xffff;
const SCORE_BIAS = 32;
const FINGERPRINT_BITS = 10;
const FINGERPRINT_MASK = (1 << FINGERPRINT_BITS) - 1;
const BUCKET_SEED = 0x5bd1e995;
const FINGERPRINT_SEED = 0x27d4eb2f;

// ── Hashing ───────────────────────────────────────────────────────────────

/** A 32-bit mix of a 64-bit key (two halves) under `seed`. */
export function hashKey(lo: number, hi: number, seed: number): number {
  let h = Math.imul(lo ^ seed, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h ^ hi, 0x85ebca77);
  h ^= h >>> 13;
  h = Math.imul(h ^ (lo >>> 7) ^ seed, 0xc2b2ae3d);
  h ^= h >>> 16;
  return h >>> 0;
}

export function bucketOf(lo: number, hi: number, buckets: number): number {
  return hashKey(lo, hi, BUCKET_SEED) % buckets;
}

export function slotOf(lo: number, hi: number, displacement: number, slots: number): number {
  return hashKey(lo, hi, Math.imul(displacement + 1, 0x01000193)) % slots;
}

export function fingerprintOf(lo: number, hi: number): number {
  return hashKey(lo, hi, FINGERPRINT_SEED) & FINGERPRINT_MASK;
}

export function encodeSlot(lo: number, hi: number, score: number): number {
  return (fingerprintOf(lo, hi) << 6) | (score + SCORE_BIAS);
}

/** The smaller of a key and its mirror image's — one entry per mirror pair. */
export function canonicalKey(
  lo: number,
  hi: number,
  mirrorLo: number,
  mirrorHi: number,
): [number, number] {
  const h = hi >>> 0;
  const mh = mirrorHi >>> 0;
  if (mh < h || (mh === h && mirrorLo >>> 0 < lo >>> 0)) return [mirrorLo, mirrorHi];
  return [lo, hi];
}

// ── Reading ───────────────────────────────────────────────────────────────

/** A book's lookup over its decoded bytes. */
export function bookLookup(book: BookData): BookLookup {
  if (book.format !== 2) throw new Error(`Unknown Connect 4 book format ${book.format}`);
  const bin = atob(book.data);
  const words = new Uint16Array(book.buckets + book.slots);
  for (let i = 0; i < words.length; i++) {
    words[i] = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
  }
  const displacement = words.subarray(0, book.buckets);
  const entries = words.subarray(book.buckets);
  const { maxMoves, buckets, slots } = book;
  return (keyLo, keyHi, mirrorLo, mirrorHi, moves) => {
    if (moves > maxMoves) return undefined;
    const [lo, hi] = canonicalKey(keyLo, keyHi, mirrorLo, mirrorHi);
    const entry = entries[slotOf(lo, hi, displacement[bucketOf(lo, hi, buckets)], slots)];
    if (entry === EMPTY_SLOT || entry >>> 6 !== fingerprintOf(lo, hi)) return undefined;
    return (entry & 63) - SCORE_BIAS;
  };
}

/** Encode `words` (u16, little-endian) as base64. */
export function encodeWords(words: Uint16Array): string {
  const bytes = new Uint8Array(words.buffer, words.byteOffset, words.byteLength);
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(out);
}

// ── Loading ───────────────────────────────────────────────────────────────

/**
 * The board sizes with a book, and how to fetch each. A module whose `BOOK` is
 * null is a placeholder until `c4-book` has written it; that board searches.
 */
const BOOK_MODULES: Record<string, () => Promise<{ BOOK: BookData | null }>> = {
  "6x5": () => import("./books/6x5.gen"),
  "7x6": () => import("./books/7x6.gen"),
};

const loaded = new Map<string, { lookup: BookLookup; maxMoves: number }>();
const pending = new Map<string, Promise<BookLookup | null>>();

/** Fetch and decode a board's book (once). Resolves null for a board without one. */
export function loadOpeningBook(cols: number, rows: number): Promise<BookLookup | null> {
  const size = `${cols}x${rows}`;
  const ready = loaded.get(size);
  if (ready) return Promise.resolve(ready.lookup);
  const load = BOOK_MODULES[size];
  if (!load) return Promise.resolve(null);
  let job = pending.get(size);
  if (!job) {
    job = load().then(({ BOOK }) => {
      if (!BOOK) return null;
      const lookup = bookLookup(BOOK);
      loaded.set(size, { lookup, maxMoves: BOOK.maxMoves });
      return lookup;
    });
    pending.set(size, job);
  }
  return job;
}

/** Every book, loaded — for long-lived solvers (the server's AI workers, the CLI). */
export async function loadOpeningBooks(): Promise<void> {
  await Promise.all(
    Object.keys(BOOK_MODULES).map((size) => {
      const [cols, rows] = size.split("x").map(Number);
      return loadOpeningBook(cols, rows);
    }),
  );
}

/** A board's book if it has been loaded, else null (the solver then searches). */
export function openingBook(cols: number, rows: number): BookLookup | null {
  return loaded.get(`${cols}x${rows}`)?.lookup ?? null;
}

/** The deepest position (in discs) a board's loaded book covers, or -1. */
export function bookDepth(cols: number, rows: number): number {
  return loaded.get(`${cols}x${rows}`)?.maxMoves ?? -1;
}
