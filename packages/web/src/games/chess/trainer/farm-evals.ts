/**
 * The analysis farm's results, as the tree builder reads them: a cache of
 * finished evaluations by FEN, filled by asking the server for every position
 * a build pass parked (`POST /api/trainers/chess/evals`). The server answers
 * the known ones and queues the rest for ws21.
 */
import type { NodeEval } from "@boardgames/core/games/chess/trainer/builder";
import {
  EVAL_REQUEST_MAX,
  EvalRequestBodySchema,
  type EvalRequestResponse,
  EvalRequestResponseSchema,
  type PositionEval,
} from "@boardgames/core/protocol";
import { apiFetch } from "../../../lib/api-fetch";
import type { PendingEval } from "./build.worker";

export type FarmState = EvalRequestResponse["farm"] & {
  /** Positions this tree is waiting for. */
  readonly waiting: number;
};

/** A farm result as tree data: the move to play first, then the other lines. */
export function toNodeEval(r: PositionEval): NodeEval {
  const lines = r.lines.map((l) => ({
    uci: l.uci,
    cp: l.cp,
    mate: l.mate,
    depth: l.depth,
    seldepth: l.seldepth,
    nodes: l.nodes,
  }));
  const bestFirst =
    r.kind === "user"
      ? [...lines.filter((l) => l.uci === r.best), ...lines.filter((l) => l.uci !== r.best)]
      : lines;
  // Lc0 may have chosen a tied move Stockfish didn't put first; it still leads.
  if (r.kind === "user" && bestFirst[0]?.uci !== r.best) {
    bestFirst.unshift({
      uci: r.best,
      cp: null,
      mate: null,
      depth: r.depth,
      seldepth: null,
      nodes: null,
    });
  }
  return {
    lines: bestFirst,
    source: r.source,
    ties: r.ties,
    contested: r.contested,
    lc0: r.lc0 ?? undefined,
  };
}

export class FarmEvals {
  private readonly known = new Map<string, NodeEval>();

  snapshot(): Record<string, NodeEval> {
    return Object.fromEntries(this.known);
  }

  /**
   * Ask the server about `items`: returns how many new results arrived and
   * the farm's queue state.
   */
  async request(items: readonly PendingEval[]): Promise<{ added: number; farm: FarmState | null }> {
    const todo = items.filter((i) => !this.known.has(i.fen));
    let added = 0;
    let last: EvalRequestResponse | null = null;
    let queued = 0;
    for (let i = 0; i < todo.length; i += EVAL_REQUEST_MAX) {
      const chunk = todo.slice(i, i + EVAL_REQUEST_MAX);
      last = await apiFetch("/api/trainers/chess/evals", {
        method: "POST",
        body: { items: chunk },
        request: EvalRequestBodySchema,
        response: EvalRequestResponseSchema,
      });
      queued += last.queued;
      for (const [fen, r] of Object.entries(last.results)) {
        if (!this.known.has(fen)) {
          this.known.set(fen, toNodeEval(r));
          added++;
        }
      }
    }
    return { added, farm: last ? { ...last.farm, waiting: queued } : null };
  }
}
