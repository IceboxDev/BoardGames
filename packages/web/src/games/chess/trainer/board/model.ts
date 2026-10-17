/**
 * The board screen's pure logic: walking a line of moves from the start and
 * merging every source into the explorer's rows.
 */
import { applyMove } from "@boardgames/core/games/chess/engine/apply";
import { parseFen, positionKey, START_FEN, toFen } from "@boardgames/core/games/chess/engine/fen";
import { legalMoves } from "@boardgames/core/games/chess/engine/movegen";
import { toSan } from "@boardgames/core/games/chess/engine/san";
import { moveToUci } from "@boardgames/core/games/chess/engine/uci";
import type { MoveStat } from "@boardgames/core/games/chess/trainer/position-index";
import type {
  EngineLine,
  RepertoireTree,
  TreeMoveSource,
  TreeNode,
} from "@boardgames/core/games/chess/trainer/tree";
import type { ExplorerMove } from "../lichess/client";
import { keyAfter } from "../tree-nav";

export interface Position {
  readonly fen: string;
  readonly key: string;
}

/** One move of a line: what was played and where it led. */
export interface LineStep extends Position {
  readonly uci: string;
  readonly san: string;
}

export const START: Position = { fen: START_FEN, key: positionKey(parseFen(START_FEN)) };

/** The positions along `moves` from the start, stopping at the first illegal move. */
export function walkLine(moves: readonly string[]): LineStep[] {
  const steps: LineStep[] = [];
  let pos = parseFen(START_FEN);
  for (const uci of moves) {
    const legal = legalMoves(pos);
    const move = legal.find((m) => moveToUci(m) === uci);
    if (!move) break;
    const san = toSan(pos, move, legal);
    pos = applyMove(pos, move);
    steps.push({ uci, san, fen: toFen(pos), key: positionKey(pos) });
  }
  return steps;
}

// ── Explorer rows ────────────────────────────────────────────────────────

export interface ExplorerRow {
  readonly uci: string;
  readonly san: string;
  /** How the tree has this move, if it does (★ = your move here). */
  readonly tree: TreeMoveSource | null;
  /** The tree continues past this move (a click keeps you in the tree). */
  readonly inTree: boolean;
  /** Your games that played it here, and your points from them. */
  readonly yours: { games: number; score: number } | null;
  /** The lichess database. */
  readonly db: { games: number; share: number; white: number; draws: number; black: number } | null;
  /** The engine's line for it, from the side to move. */
  readonly engine: EngineLine | null;
}

export function explorerRows(input: {
  fen: string;
  node: TreeNode | null;
  tree: RepertoireTree | null;
  yours: readonly MoveStat[];
  db: readonly ExplorerMove[];
  engine: readonly EngineLine[];
}): ExplorerRow[] {
  const { fen, node, tree, yours, db, engine } = input;
  const pos = parseFen(fen);
  const legal = legalMoves(pos);
  const san = new Map(legal.map((m) => [moveToUci(m), toSan(pos, m, legal)]));
  const dbTotal = db.reduce((n, m) => n + m.games, 0);
  const ucis = new Set<string>();
  for (const m of node?.moves ?? []) ucis.add(m.uci);
  for (const m of yours) ucis.add(m.uci);
  for (const m of db) ucis.add(m.uci);
  for (const l of engine) ucis.add(l.uci);
  const rows = [...ucis]
    .filter((u) => san.has(u))
    .map((uci): ExplorerRow => {
      const t = node?.moves.find((m) => m.uci === uci);
      const y = yours.find((m) => m.uci === uci);
      const d = db.find((m) => m.uci === uci);
      const next = t ? keyAfter(fen, uci) : null;
      return {
        uci,
        san: san.get(uci) ?? uci,
        tree: t?.source ?? null,
        inTree: !!(tree && next && tree.nodes[next]),
        yours: y ? { games: y.games, score: y.score } : null,
        db: d
          ? {
              games: d.games,
              share: dbTotal > 0 ? d.games / dbTotal : 0,
              white: d.white,
              draws: d.draws,
              black: d.black,
            }
          : null,
        engine: engine.find((l) => l.uci === uci) ?? null,
      };
    });
  const treeOrder = (r: ExplorerRow) => (r.tree ? 0 : 1);
  // The tree's own moves in the engine's order (best first); moves the engine
  // didn't score after the scored ones, by games.
  const engineOrder = (a: ExplorerRow, b: ExplorerRow) =>
    a.tree && b.tree ? lineValue(b.engine) - lineValue(a.engine) : 0;
  return rows.sort(
    (a, b) =>
      treeOrder(a) - treeOrder(b) ||
      engineOrder(a, b) ||
      (b.yours?.games ?? 0) - (a.yours?.games ?? 0) ||
      (b.db?.games ?? 0) - (a.db?.games ?? 0) ||
      (b.engine ? 1 : 0) - (a.engine ? 1 : 0),
  );
}

/** An engine line as one number from the side to move (mates beyond any cp); none = lowest. */
export function lineValue(line: EngineLine | null | undefined): number {
  if (!line) return Number.NEGATIVE_INFINITY;
  if (line.mate !== null) return line.mate > 0 ? 100_000 - line.mate : -100_000 - line.mate;
  return line.cp ?? 0;
}

/** An engine line from `fen` as numbered SAN (`3.Bb5`, `3…a6`), stopping at an illegal move. */
export function pvSans(
  fen: string,
  pv: readonly string[],
  max: number,
): { uci: string; label: string }[] {
  const out: { uci: string; label: string }[] = [];
  let pos = parseFen(fen);
  for (const uci of pv.slice(0, max)) {
    const legal = legalMoves(pos);
    const move = legal.find((m) => moveToUci(m) === uci);
    if (!move) break;
    const n = pos.fullmove;
    const white = pos.turn === "w";
    const san = toSan(pos, move, legal);
    out.push({ uci, label: white ? `${n}.${san}` : out.length === 0 ? `${n}…${san}` : san });
    pos = applyMove(pos, move);
  }
  return out;
}
