/**
 * Where a game left your repertoire: walk its positions through your tree
 * (keyed by position, so a transposition back into it counts) and stop at
 * the first move that isn't the tree's — yours (`you-left`: your move here is
 * another one) or the opponent's (`they-left`: a reply the tree doesn't
 * prepare). A game that stays in to its end, or reaches a position the tree
 * hasn't settled yet, says so too.
 */
import { applyMove } from "../engine/apply";
import { parseFen, positionKey } from "../engine/fen";
import { legalMoves } from "../engine/movegen";
import { moveToUci } from "../engine/uci";
import type { RepertoireTree, TreeMoveSource } from "./tree";

export type Deviation =
  | {
      readonly kind: "you-left";
      /** Index of the game's move that left. */
      readonly index: number;
      readonly played: string;
      /** The tree's move here (UCI) and where it came from (★ yours, or the engine's). */
      readonly expected: string;
      readonly source: TreeMoveSource;
    }
  | { readonly kind: "they-left"; readonly index: number; readonly played: string }
  /** The tree hasn't settled your move here yet (waiting for the farm or your choice). */
  | { readonly kind: "unsettled"; readonly index: number }
  /** Every move stayed in the tree (to the game's end, or past the tree's last position). */
  | { readonly kind: "stayed"; readonly plies: number };

export function deviationOf(
  tree: RepertoireTree,
  startFen: string,
  ucis: readonly string[],
): Deviation {
  let pos = parseFen(startFen);
  for (let i = 0; i < ucis.length; i++) {
    const uci = ucis[i] as string;
    const node = tree.nodes[positionKey(pos)];
    // Past the tree's last position: everything up to here was in it.
    if (!node || node.moves.length === 0) {
      if (node && pos.turn === tree.color && node.status !== "terminal") {
        return { kind: "unsettled", index: i };
      }
      return { kind: "stayed", plies: i };
    }
    if (pos.turn === tree.color) {
      const mine = node.moves[0];
      if (mine && mine.uci !== uci) {
        return { kind: "you-left", index: i, played: uci, expected: mine.uci, source: mine.source };
      }
    } else if (!node.moves.some((m) => m.uci === uci)) {
      return { kind: "they-left", index: i, played: uci };
    }
    const move = legalMoves(pos).find((m) => moveToUci(m) === uci);
    if (!move) return { kind: "stayed", plies: i };
    pos = applyMove(pos, move);
  }
  return { kind: "stayed", plies: ucis.length };
}
