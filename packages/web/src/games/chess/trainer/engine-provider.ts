/**
 * Where a tree's engine choices and "most popular" moves come from.
 *
 * Engine: lichess's cloud eval first (deep, instant, but only for positions
 * people analyse — so only asked about the opening's first dozen moves), else
 * Stockfish in this browser (`BrowserEngine`). "Best move" is just the top
 * line at the tree's depth for now; its definition comes later.
 * Popular: the lichess opening explorer, every rating and speed.
 */
import type { TreeProviders } from "@boardgames/core/games/chess/trainer/builder";
import type { EngineLine } from "@boardgames/core/games/chess/trainer/tree";
import { BrowserEngine } from "../analysis/engine";
import { cloudEval, type ExplorerMove, type LichessPriority } from "./lichess/client";
import { cachedExplorerMoves } from "./lichess/explorer-store";
import { legalUcis } from "./tree-nav";

/** An evaluation with its lines' continuations and where it came from. */
export interface QuickEval {
  readonly lines: (EngineLine & { readonly pv?: readonly string[] })[];
  readonly source: string;
}

/** Cloud evals are only asked for up to this full move. */
const CLOUD_MAX_MOVE = 12;

/** lichess can write castling as the king taking its rook (`e1h1`). */
const CASTLE_AS_ROOK: Record<string, string> = {
  e1h1: "e1g1",
  e1a1: "e1c1",
  e8h8: "e8g8",
  e8a8: "e8c8",
};

/** Moves in our UCI: castling as the king's two-square move. */
export function normalizeUcis<T extends { uci: string }>(fen: string, moves: readonly T[]): T[] {
  const legal = new Set(legalUcis(fen));
  return moves.map((m) => {
    const castle = CASTLE_AS_ROOK[m.uci];
    return !legal.has(m.uci) && castle && legal.has(castle) ? { ...m, uci: castle } : m;
  });
}

export class TrainerProviders implements TreeProviders {
  private engine: BrowserEngine | null = null;

  constructor(private readonly token: string) {}

  async engineLines(fen: string, multipv: number, depth: number): Promise<EngineLine[]> {
    const move = Number(fen.split(" ")[5] ?? "1");
    if (move <= CLOUD_MAX_MOVE) {
      const cloud = await cloudEval(fen, multipv, this.token).catch(() => null);
      if (cloud && cloud.length >= multipv && (cloud[0]?.depth ?? 0) >= depth) {
        return normalizeUcis(fen, cloud);
      }
    }
    this.engine ??= new BrowserEngine();
    const turn = fen.split(" ")[1] === "b" ? -1 : 1;
    const lines = await this.engine.analyse(fen, depth, multipv);
    return lines.flatMap((l) => {
      const uci = l.pv[0] ?? l.best;
      if (!uci) return [];
      // BrowserEngine scores from White's side; trees store the mover's.
      return [
        {
          uci,
          cp: "cp" in l.score ? turn * l.score.cp : null,
          mate: "mate" in l.score ? turn * l.score.mate : null,
          depth: l.depth,
        },
      ];
    });
  }

  /**
   * The best evaluation to hand for a position: lichess's cloud (deep —
   * often depth 40–60 on opening positions) for up to five moves, else a
   * quick search in this browser. Lines carry their principal variation.
   */
  /** lichess's cloud evaluation alone (cheap — for prefetching), or null when it has none. */
  async cloudLines(fen: string): Promise<QuickEval | null> {
    const cloud = await cloudEval(fen, 5, this.token).catch(() => null);
    return cloud && cloud.length > 0
      ? { lines: normalizeUcis(fen, cloud), source: "lichess cloud" }
      : null;
  }

  async quickLines(fen: string, depth: number): Promise<QuickEval> {
    const cloud = await cloudEval(fen, 5, this.token).catch(() => null);
    if (cloud && cloud.length > 0) {
      return { lines: normalizeUcis(fen, cloud), source: "lichess cloud" };
    }
    this.engine ??= new BrowserEngine();
    const turn = fen.split(" ")[1] === "b" ? -1 : 1;
    const lines = await this.engine.analyse(fen, depth, 3);
    return {
      source: "this browser",
      lines: lines.flatMap((l) => {
        const uci = l.pv[0] ?? l.best;
        if (!uci) return [];
        return [
          {
            uci,
            cp: "cp" in l.score ? turn * l.score.cp : null,
            mate: "mate" in l.score ? turn * l.score.mate : null,
            depth: l.depth,
            pv: l.pv,
          },
        ];
      }),
    };
  }

  private readonly explorerCache = new Map<string, Promise<ExplorerMove[]>>();

  /**
   * The lichess database here, with results; asked once per position, from
   * the server's shared cache when anyone has fetched it (`explorer-store.ts`).
   */
  explorer(fen: string, priority: LichessPriority = "now"): Promise<ExplorerMove[]> {
    let hit = this.explorerCache.get(fen);
    if (!hit) {
      hit = cachedExplorerMoves(fen, this.token, priority).then((m) => normalizeUcis(fen, m));
      hit.catch(() => this.explorerCache.delete(fen));
      this.explorerCache.set(fen, hit);
    }
    return hit;
  }

  async popularMoves(fen: string) {
    return (await this.explorer(fen, "build")).map(({ uci, games }) => ({ uci, games }));
  }

  dispose(): void {
    this.engine?.terminate();
    this.engine = null;
  }
}
