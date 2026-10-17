/**
 * Evaluations this browser has already looked up (lichess cloud or its own
 * Stockfish), kept in memory and in IndexedDB, so a position seen once shows
 * its evaluation at once — after a reload too. The farm's deep results don't
 * need this: they live in the tree itself.
 */
import type { QuickEval } from "../engine-provider";

const DB_NAME = "chess-trainer-evals";
const STORE = "evals";
/** Enough for every position you'll browse; the oldest go first. */
const MEMORY_MAX = 5000;

const memory = new Map<string, QuickEval>();
let dbPromise: Promise<IDBDatabase | null> | null = null;

/** Cache key: the position only (board, side, castling, en passant) — not the move clocks. */
export const evalKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

function db(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function remember(key: string, value: QuickEval) {
  memory.delete(key);
  memory.set(key, value);
  if (memory.size > MEMORY_MAX) {
    const oldest = memory.keys().next().value;
    if (oldest !== undefined) memory.delete(oldest);
  }
}

/** What's in memory right now (synchronous: no flash for a known position). */
export function cachedEval(fen: string): QuickEval | null {
  return memory.get(evalKey(fen)) ?? null;
}

/** Memory, else IndexedDB. */
export async function storedEval(fen: string): Promise<QuickEval | null> {
  const key = evalKey(fen);
  const hit = memory.get(key);
  if (hit) return hit;
  const d = await db();
  if (!d) return null;
  const value = await new Promise<QuickEval | null>((resolve) => {
    try {
      const req = d.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve((req.result as QuickEval | undefined) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  if (value) remember(key, value);
  return value;
}

export async function storeEval(fen: string, value: QuickEval): Promise<void> {
  const key = evalKey(fen);
  remember(key, value);
  const d = await db();
  if (!d) return;
  try {
    d.transaction(STORE, "readwrite").objectStore(STORE).put(value, key);
  } catch {
    // Not kept (quota, private window): it stays in memory for this visit.
  }
}
