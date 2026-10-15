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
import { cloudEval, explorerMoves } from "./lichess/client";
import { legalUcis } from "./tree-nav";

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

  async popularMoves(fen: string) {
    return normalizeUcis(fen, await explorerMoves(fen, this.token));
  }

  dispose(): void {
    this.engine?.terminate();
    this.engine = null;
  }
}
