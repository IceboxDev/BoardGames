/**
 * The tree build, off the main thread: indexing tens of thousands of games
 * takes seconds. The engine and lichess stay on the page (`build-client.ts`);
 * this worker asks for them by message.
 */
import {
  type BuildProgress,
  buildTree,
  EvalPending,
  type NodeEval,
} from "@boardgames/core/games/chess/trainer/builder";
import { legalPrefix, PositionIndex } from "@boardgames/core/games/chess/trainer/position-index";
import type {
  EngineLine,
  PopularMove,
  RepertoireTree,
  TreeSettings,
} from "@boardgames/core/games/chess/trainer/tree";
import type { ChessTrainerGame } from "@boardgames/core/protocol";

export type ToWorker =
  | { type: "index"; games: ChessTrainerGame[] }
  | {
      type: "build";
      color: "w" | "b";
      settings: TreeSettings;
      previous: RepertoireTree | null;
      /** The analysis farm's results known so far, by FEN. */
      evals: Record<string, NodeEval>;
    }
  | { type: "stop" }
  | { type: "answer"; id: number; lines?: EngineLine[]; popular?: PopularMove[]; error?: string };

export type FromWorker =
  | { type: "indexing"; done: number; total: number }
  | { type: "indexed"; games: number }
  | { type: "progress"; progress: BuildProgress }
  | { type: "checkpoint"; tree: RepertoireTree }
  | { type: "done"; tree: RepertoireTree; pending: PendingEval[] }
  | { type: "failed"; message: string }
  | { type: "ask-engine"; id: number; fen: string; multipv: number; depth: number }
  | { type: "ask-popular"; id: number; fen: string };

/** A position the build needs from the farm. */
export interface PendingEval {
  readonly fen: string;
  readonly kind: "user" | "opp";
  readonly reach: number;
}

const scope = self as unknown as {
  postMessage(message: FromWorker): void;
  onmessage: ((e: MessageEvent<ToWorker>) => void) | null;
};
const post = (m: FromWorker) => scope.postMessage(m);

let index: PositionIndex | null = null;
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
  if (m.type === "index") {
    const games = m.games.map((g) => ({ id: g.id, moves: legalPrefix(g.uci), result: g.result }));
    index = PositionIndex.build(games, (done) =>
      post({ type: "indexing", done, total: games.length }),
    );
    post({ type: "indexed", games: games.length });
    return;
  }
  if (!index) {
    post({ type: "failed", message: "No games indexed" });
    return;
  }
  stopRequested = false;
  let last = 0;
  const pending = new Map<string, PendingEval>();
  const evaluate = async (fen: string, kind: "user" | "opp", reach: number): Promise<NodeEval> => {
    const hit = m.evals[fen];
    if (hit) return hit;
    const prev = pending.get(fen);
    pending.set(fen, { fen, kind, reach: Math.max(reach, prev?.reach ?? 0) });
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
