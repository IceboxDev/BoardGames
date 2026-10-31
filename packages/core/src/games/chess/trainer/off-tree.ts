/**
 * The farm's positions no tree of yours can reach any more.
 *
 * At a position of yours exactly one move is yours: the one you starred in a
 * tree ("★ Make it my move", a `handpicked` choice), else the engine's best
 * from the farm. A position the tree only reaches through a different move of
 * yours is off the tree — a leftover of a choice that changed (1.e4 c6 2.c3
 * once, now your starred 2.d4), and so is everything past it. A position of
 * yours not settled yet keeps every move open (the engine may still pick it),
 * and the opponent may play anything, so nothing waiting or merely padded is
 * lost.
 *
 * Each position belongs to one colour's tree: yours to move in that colour
 * (`kind: "user"`), or the opponent's (`kind: "opp"`).
 */
import { applyMove } from "../engine/apply";
import { parseFen, positionKey, START_FEN } from "../engine/fen";
import { legalMoves } from "../engine/movegen";
import type { Position } from "../engine/types";
import { moveToUci } from "../engine/uci";

export interface HeldPosition {
  readonly key: string;
  readonly fen: string;
  readonly kind: "user" | "opp";
}

/** The colour whose tree a held position belongs to. */
export function treeColor(p: Pick<HeldPosition, "fen" | "kind">): "w" | "b" {
  const toMove = p.fen.split(" ")[1] === "b" ? "b" : "w";
  return p.kind === "user" ? toMove : toMove === "w" ? "b" : "w";
}

/**
 * The held positions of `color`'s tree that it can't reach (see the header).
 * `best` is the farm's move at each finished position of yours; `choices`
 * your starred moves, by position key (they win over `best`).
 */
export function offTreePositions(input: {
  readonly color: "w" | "b";
  readonly positions: readonly HeldPosition[];
  readonly best: ReadonlyMap<string, string>;
  readonly choices: ReadonlyMap<string, string>;
}): HeldPosition[] {
  const { color, best, choices } = input;
  const mine = input.positions.filter((p) => treeColor(p) === color);
  // Positions of yours the walk may enter: held, finished or chosen.
  const enterable = new Set([
    ...mine.filter((p) => p.kind === "user").map((p) => p.key),
    ...best.keys(),
    ...choices.keys(),
  ]);

  const reached = new Set<string>();
  const stack: Position[] = [parseFen(START_FEN)];
  while (stack.length > 0) {
    const pos = stack.pop() as Position;
    const key = positionKey(pos);
    if (reached.has(key)) continue;
    reached.add(key);
    const moves = legalMoves(pos);
    if (pos.turn === color) {
      const set = choices.get(key) ?? best.get(key);
      for (const m of set ? moves.filter((x) => moveToUci(x) === set) : moves) {
        stack.push(applyMove(pos, m));
      }
    } else {
      for (const m of moves) {
        const next = applyMove(pos, m);
        if (enterable.has(positionKey(next))) stack.push(next);
      }
    }
  }
  return mine.filter((p) => !reached.has(p.key));
}
