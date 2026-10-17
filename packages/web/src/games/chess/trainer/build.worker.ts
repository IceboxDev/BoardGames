/**
 * The tree build, off the main thread: indexing tens of thousands of games
 * takes seconds. The engine and lichess stay on the page (`build-client.ts`);
 * this worker asks for them by message.
 */

import { parseFen, positionKey } from "@boardgames/core/games/chess/engine/fen";
import {
  type BuildProgress,
  buildTree,
  EvalPending,
  type NodeEval,
} from "@boardgames/core/games/chess/trainer/builder";
import {
  type MoveStat,
  PositionIndex,
  type PositionIndexData,
} from "@boardgames/core/games/chess/trainer/position-index";
import type {
  EngineLine,
  PopularMove,
  RepertoireTree,
  TreeSettings,
} from "@boardgames/core/games/chess/trainer/tree";
import type { ChessTrainerGame } from "@boardgames/core/protocol";
import { folderOwners } from "./folder-owners";

export type ToWorker =
  /** Use the index kept in this browser under `key`, if there is one. */
  | { type: "load"; key: string }
  /** Index these games and keep the index under `key`. */
  | { type: "index"; key: string; games: ChessTrainerGame[] }
  | {
      type: "build";
      color: "w" | "b";
      settings: TreeSettings;
      previous: RepertoireTree | null;
      /** The analysis farm's results known so far, by FEN. */
      evals: Record<string, NodeEval>;
    }
  | { type: "stop" }
  /** What your games played from a position (the explorer's "You" column). */
  | { type: "stats"; id: number; fen: string }
  /**
   * Which folder owns each of your games: the most specific folder position a
   * game reaches, by any move order. `folders` are positions with the moves
   * that name them; the deepest reached wins.
   */
  | { type: "folders"; id: number; folders: { fen: string; moves: string[] }[] }
  /** How many of the games at a position got there by another move order than `moves`. */
  | { type: "transposed"; id: number; fen: string; moves: string[] }
  | { type: "answer"; id: number; lines?: EngineLine[]; popular?: PopularMove[]; error?: string };

export type FromWorker =
  | { type: "loaded"; hit: boolean }
  | { type: "indexing"; done: number; total: number }
  | { type: "indexed"; games: number }
  | { type: "progress"; progress: BuildProgress }
  | { type: "checkpoint"; tree: RepertoireTree }
  | { type: "done"; tree: RepertoireTree; pending: PendingEval[] }
  | { type: "failed"; message: string }
  | { type: "ask-engine"; id: number; fen: string; multipv: number; depth: number }
  | { type: "ask-popular"; id: number; fen: string }
  | { type: "stats"; id: number; moves: MoveStat[] }
  /** Per folder: distinct games it owns directly, and how many of those transposed into it. */
  | { type: "folders"; id: number; owned: number[]; transposed: number[] }
  | { type: "transposed"; id: number; games: number; transposed: number };

/** A position the build needs from the farm. */
export interface PendingEval {
  readonly fen: string;
  readonly kind: "user" | "opp";
  readonly reach: number;
  /** 0 on a game line; 1–3 a line end's extension. */
  readonly stage: number;
}

const scope = self as unknown as {
  postMessage(message: FromWorker): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};
const post = (m: FromWorker) => scope.postMessage(m);

let index: PositionIndex | null = null;

// ── The index, kept in IndexedDB between visits ─────────────────────────
// One entry per colour: `key` names the games it was built from (their count,
// the newest, the speeds), so new games or other settings rebuild it.
const DB_NAME = "chess-trainer";
const STORE = "indexes";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** The slot a key lives in: its colour (`v1:<colour>:…`). */
const slotOf = (key: string) => key.split(":")[1] ?? key;

async function loadKept(key: string): Promise<PositionIndexData | null> {
  try {
    const db = await openDb();
    const entry = await new Promise<{ key: string; data: PositionIndexData } | undefined>(
      (resolve, reject) => {
        const req = db.transaction(STORE).objectStore(STORE).get(slotOf(key));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      },
    );
    db.close();
    return entry?.key === key ? entry.data : null;
  } catch {
    return null;
  }
}

async function keep(key: string, data: PositionIndexData): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key, data }, slotOf(key));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Not kept (private window, quota): next visit indexes again.
  }
}
let stopRequested = false;
let nextId = 1;
const waiting = new Map<number, { resolve: (v: ToWorker & { type: "answer" }) => void }>();

function ask(m: FromWorker & { id: number }): Promise<ToWorker & { type: "answer" }> {
  return new Promise((resolve) => {
    waiting.set(m.id, { resolve });
    post(m);
  });
}

async function engineLines(fen: string, multipv: number, depth: number): Promise<EngineLine[]> {
  const a = await ask({ type: "ask-engine", id: nextId++, fen, multipv, depth });
  if (a.error) throw new Error(a.error);
  return a.lines ?? [];
}

async function popularMoves(fen: string): Promise<PopularMove[]> {
  const a = await ask({ type: "ask-popular", id: nextId++, fen });
  if (a.error) throw new Error(a.error);
  return a.popular ?? [];
}

scope.onmessage = async (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === "answer") {
    waiting.get(m.id)?.resolve(m);
    waiting.delete(m.id);
    return;
  }
  if (m.type === "stop") {
    stopRequested = true;
    return;
  }
  if (m.type === "load") {
    const data = await loadKept(m.key);
    if (data) index = PositionIndex.fromData(data);
    post({ type: "loaded", hit: data !== null });
    return;
  }
  if (m.type === "index") {
    // Stored games hold only legal moves (checked once when imported).
    const games = m.games.map((g) => ({
      id: g.id,
      moves: PositionIndex.split(g.uci),
      result: g.result,
    }));
    index = PositionIndex.build(games, (done) =>
      post({ type: "indexing", done, total: games.length }),
    );
    post({ type: "indexed", games: games.length });
    void keep(m.key, index.toData());
    return;
  }
  if (m.type === "folders") {
    const r = index
      ? folderOwners(index, m.folders)
      : { owned: m.folders.map(() => 0), transposed: m.folders.map(() => 0) };
    post({ type: "folders", id: m.id, ...r });
    return;
  }
  if (m.type === "transposed") {
    let games = 0;
    let other = 0;
    try {
      const seen = new Set<string>();
      for (const { game, ply } of index?.occurrences(positionKey(parseFen(m.fen))) ?? []) {
        const moves = index?.games[game]?.moves ?? [];
        const line = moves.join(" ");
        if (seen.has(line)) continue;
        seen.add(line);
        games++;
        if (ply !== m.moves.length || m.moves.some((u, i) => moves[i] !== u)) other++;
      }
    } catch {
      // An unreadable FEN has no games.
    }
    post({ type: "transposed", id: m.id, games, transposed: other });
    return;
  }
  if (m.type === "stats") {
    let moves: MoveStat[] = [];
    try {
      moves = index?.movesFrom(positionKey(parseFen(m.fen))) ?? [];
    } catch {
      // An unreadable FEN has no games.
    }
    post({ type: "stats", id: m.id, moves });
    return;
  }
  if (!index) {
    post({ type: "failed", message: "No games indexed" });
    return;
  }
  stopRequested = false;
  let last = 0;
  const pending = new Map<string, PendingEval>();
  const evaluate = async (
    fen: string,
    kind: "user" | "opp",
    reach: number,
    stage = 0,
  ): Promise<NodeEval> => {
    const hit = m.evals[fen];
    if (hit) return hit;
    const prev = pending.get(fen);
    pending.set(fen, {
      fen,
      kind,
      reach: Math.max(reach, prev?.reach ?? 0),
      stage: Math.min(stage, prev?.stage ?? stage),
    });
    throw new EvalPending();
  };
  try {
    const tree = await buildTree(
      index,
      m.color,
      m.settings,
      m.previous,
      { engineLines, popularMoves, evaluate },
      {
        shouldStop: () => stopRequested,
        onProgress: (progress) => {
          const now = performance.now();
          if (now - last < 150) return;
          last = now;
          post({ type: "progress", progress });
        },
        onCheckpoint: (tree) => post({ type: "checkpoint", tree }),
        checkpointEvery: 40,
      },
    );
    post({ type: "done", tree, pending: [...pending.values()] });
  } catch (err) {
    post({ type: "failed", message: err instanceof Error ? err.message : String(err) });
  }
};
