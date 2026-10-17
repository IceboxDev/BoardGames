/** Walking a stored opening tree: children, routes to a position, and where you leave it. */
import { applyMove } from "@boardgames/core/games/chess/engine/apply";
import { parseFen, positionKey } from "@boardgames/core/games/chess/engine/fen";
import { legalMoves } from "@boardgames/core/games/chess/engine/movegen";
import { toSan } from "@boardgames/core/games/chess/engine/san";
import { moveToUci } from "@boardgames/core/games/chess/engine/uci";
import type { RepertoireTree, TreeNode } from "@boardgames/core/games/chess/trainer/tree";

/** The key of the position after `uci` from `fen`, or `null` for an illegal move. */
export function keyAfter(fen: string, uci: string): string | null {
  const pos = parseFen(fen);
  const move = legalMoves(pos).find((m) => moveToUci(m) === uci);
  return move ? positionKey(applyMove(pos, move)) : null;
}

export function legalUcis(fen: string): string[] {
  return legalMoves(parseFen(fen)).map(moveToUci);
}

/** A step of a route through the tree: the move played and the position it reached. */
export interface Step {
  readonly uci: string;
  readonly san: string;
  readonly key: string;
}

/** The nodes along a route from the root (the root first). */
export function nodesAlong(tree: RepertoireTree, route: readonly Step[]): TreeNode[] {
  const out: TreeNode[] = [];
  const root = tree.nodes[tree.root];
  if (!root) return out;
  out.push(root);
  for (const s of route) {
    const n = tree.nodes[s.key];
    if (!n) break;
    out.push(n);
  }
  return out;
}

/** A shortest route from the root to `key`, through the tree's own moves. */
export function routeTo(tree: RepertoireTree, key: string): Step[] | null {
  if (key === tree.root) return [];
  const prev = new Map<string, { from: string; uci: string; san: string }>();
  const queue = [tree.root];
  const seen = new Set(queue);
  while (queue.length > 0) {
    const at = queue.shift() as string;
    const node = tree.nodes[at];
    if (!node) continue;
    for (const m of node.moves) {
      const next = keyAfter(node.fen, m.uci);
      if (!next || seen.has(next) || !tree.nodes[next]) continue;
      seen.add(next);
      prev.set(next, { from: at, uci: m.uci, san: m.san });
      if (next === key) {
        const route: Step[] = [];
        let cur = key;
        while (cur !== tree.root) {
          const p = prev.get(cur);
          if (!p) return null;
          route.unshift({ uci: p.uci, san: p.san, key: cur });
          cur = p.from;
        }
        return route;
      }
      queue.push(next);
    }
  }
  return null;
}

export interface DeviationSpot {
  readonly key: string;
  readonly node: TreeNode;
  readonly games: number;
}

/** Your positions where most games left the tree, most first. */
export function topDeviations(tree: RepertoireTree, limit = 5): DeviationSpot[] {
  return Object.entries(tree.nodes)
    .map(([key, node]) => ({
      key,
      node,
      games: (node.deviations ?? []).reduce((n, d) => n + d.games, 0),
    }))
    .filter((d) => d.games > 0)
    .sort((a, b) => b.games - a.games)
    .slice(0, limit);
}

/** Positions waiting for your choice, earliest first. */
export function decisionKeys(tree: RepertoireTree): string[] {
  return Object.entries(tree.nodes)
    .filter(([, n]) => n.status === "decision")
    .sort(([, a], [, b]) => a.ply - b.ply || b.following - a.following)
    .map(([k]) => k);
}

/** Move-number prefix for a SAN at a ply: `1.`, `1…`. */
export function moveLabel(ply: number, san: string): string {
  const n = Math.floor(ply / 2) + 1;
  return ply % 2 === 0 ? `${n}. ${san}` : `${n}… ${san}`;
}

/** SAN for a UCI move from `fen` (the UCI itself if it isn't legal there). */
export function sanOf(fen: string, uci: string): string {
  const pos = parseFen(fen);
  const legal = legalMoves(pos);
  const move = legal.find((m) => moveToUci(m) === uci);
  return move ? toSan(pos, move, legal) : uci;
}

/** An engine line's score for display, from White's side: `+0.4`, `#3`, `-#2`. */
export function scoreText(fen: string, line: { cp: number | null; mate: number | null }): string {
  const sign = fen.split(" ")[1] === "b" ? -1 : 1;
  if (line.mate !== null) {
    const m = sign * line.mate;
    return m >= 0 ? `#${m}` : `-#${-m}`;
  }
  const cp = sign * (line.cp ?? 0);
  return `${cp >= 0 ? "+" : ""}${(cp / 100).toFixed(1)}`;
}

/** Every tree position reachable from `roots` through the tree's own moves (roots included). */
export function reachableFrom(tree: RepertoireTree, roots: readonly string[]): Set<string> {
  const seen = new Set<string>();
  const stack = roots.filter((k) => tree.nodes[k]);
  while (stack.length > 0) {
    const key = stack.pop() as string;
    if (seen.has(key)) continue;
    seen.add(key);
    const node = tree.nodes[key];
    if (!node) continue;
    for (const m of node.moves) {
      const next = keyAfter(node.fen, m.uci);
      if (next && tree.nodes[next] && !seen.has(next)) stack.push(next);
    }
  }
  return seen;
}

/** The tree's leaves: positions whose moves lead nowhere further in the tree (where lines end, for now). */
export function isLeaf(tree: RepertoireTree, key: string): boolean {
  const node = tree.nodes[key];
  if (!node) return false;
  return !node.moves.some((m) => {
    const next = keyAfter(node.fen, m.uci);
    return next !== null && next !== key && tree.nodes[next] !== undefined;
  });
}
