/**
 * Brook — the Medium bot. UCT with RAVE (all-moves-as-first) over the fast
 * board, playouts by `FastBoard.playoutMove`. Time-budgeted: it searches until
 * the deadline and plays the most-visited move.
 *
 * Passing: the tree offers a pass only once the opponent has passed (or there
 * is nothing sensible left). A pass that ends the game is valued by playing
 * the position out anyway — the scoring phase lifts dead stones, so counting
 * the board as it stands would undervalue it.
 */

import type { Rng } from "../../../lib/rng";
import type { FastBoard } from "../fast/fast-board";

const PASS = -1;
const RAVE_K = 600;
const UCT_C = 0.35;

class Node {
  readonly move: number;
  /** Colour that played `move` to reach this node (0 black, 1 white). */
  readonly mover: number;
  readonly parent: Node | null;
  children: Node[] = [];
  untried: number[] | null = null;
  n = 0;
  w = 0;
  rn = 0;
  rw = 0;

  constructor(move: number, mover: number, parent: Node | null) {
    this.move = move;
    this.mover = mover;
    this.parent = parent;
  }
}

function candidateMoves(fb: FastBoard): number[] {
  const moves = fb.sensibleMoves();
  if (moves.length === 0 || fb.consecutivePasses > 0) moves.push(PASS);
  return moves;
}

export interface MctsOptions {
  readonly timeMs: number;
  readonly bonus: number;
  readonly maxIterations?: number;
  /** Padded moves the game allows (superko-filtered); others are never chosen at the root. */
  readonly allowed?: ReadonlySet<number>;
  readonly now?: () => number;
}

export interface MctsResult {
  readonly move: number;
  readonly iterations: number;
  readonly winrate: number;
}

export function mctsMove(root: FastBoard, rng: Rng, opts: MctsOptions): MctsResult {
  const now = opts.now ?? Date.now;
  const deadline = now() + opts.timeMs;
  const maxIter = opts.maxIterations ?? Number.POSITIVE_INFINITY;
  const tree = new Node(PASS, 1 - root.toMove, null);
  tree.untried = candidateMoves(root).filter(
    (m) => m === PASS || !opts.allowed || opts.allowed.has(m),
  );
  const cells = root.size + 2;
  const amafColor = new Int8Array(cells * cells);
  const maxPlayout = root.size * root.size * 3;
  let iterations = 0;

  while (iterations < maxIter) {
    if ((iterations & 31) === 0 && now() >= deadline && iterations > 0) break;
    iterations++;
    const fb = root.clone();
    let node = tree;
    // Selection.
    while (node.untried !== null && node.untried.length === 0 && node.children.length > 0) {
      node = select(node);
      fb.play(node.move);
    }
    // Expansion.
    if (fb.consecutivePasses < 2) {
      if (node.untried === null) node.untried = candidateMoves(fb);
      if (node.untried.length > 0) {
        const i = Math.floor(rng() * node.untried.length);
        const move = node.untried[i] as number;
        node.untried[i] = node.untried[node.untried.length - 1] as number;
        node.untried.pop();
        const child = new Node(move, fb.toMove, node);
        node.children.push(child);
        fb.play(move);
        node = child;
      }
    }
    // Playout, recording who first played each point.
    amafColor.fill(-1);
    fb.consecutivePasses = 0;
    fb.playout(rng, maxPlayout, (p, color) => {
      if (amafColor[p] === -1) amafColor[p] = color;
    });
    const blackWins = fb.playoutScore(opts.bonus) > 0 ? 1 : 0;
    // Backup.
    for (let n: Node | null = node; n !== null; n = n.parent) {
      n.n++;
      n.w += n.mover === 0 ? blackWins : 1 - blackWins;
      for (const c of n.children) {
        if (c.move >= 0 && amafColor[c.move] === c.mover) {
          c.rn++;
          c.rw += c.mover === 0 ? blackWins : 1 - blackWins;
        }
      }
      if (n.move >= 0 && amafColor[n.move] === -1) amafColor[n.move] = n.mover;
    }
  }

  let best: Node | null = null;
  for (const c of tree.children) if (!best || c.n > best.n) best = c;
  return {
    move: best ? best.move : PASS,
    iterations,
    winrate: best && best.n > 0 ? best.w / best.n : 0.5,
  };
}

function select(node: Node): Node {
  const logN = Math.log(node.n + 1);
  let best = node.children[0] as Node;
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const c of node.children) {
    const q = c.n > 0 ? c.w / c.n : 0.5;
    const rq = c.rn > 0 ? c.rw / c.rn : q;
    const beta = c.rn / (c.rn + c.n + (c.rn * c.n) / RAVE_K + 1e-9);
    const value = (1 - beta) * q + beta * rq + UCT_C * Math.sqrt(logN / (c.n + 1));
    if (value > bestValue) {
      bestValue = value;
      best = c;
    }
  }
  return best;
}
