// Information-set tree nodes. One tree per decision; no parent pointers (the
// descent keeps its path). `avail` counts how often the node was AVAILABLE
// (legal in the sampled world) when its parent was visited — subset-UCT.

export interface TenkaNode {
  key: string;
  /** Seat to move at this node (-1 once the round is over). */
  seat: number;
  visits: number;
  avail: number;
  /** Σ backed-up per-seat values. */
  value: Float64Array;
  children: Map<string, TenkaNode>;
}

export function createNode(key: string, seat: number, players: number): TenkaNode {
  return { key, seat, visits: 0, avail: 0, value: new Float64Array(players), children: new Map() };
}

export function backup(path: readonly TenkaNode[], v: Float64Array): void {
  for (const node of path) {
    node.visits++;
    for (let s = 0; s < v.length; s++) node.value[s] += v[s];
  }
}

/** UCT score of a child for the seat choosing at the parent. */
export function uct(child: TenkaNode, seat: number, c: number, scale: number): number {
  const mean = child.value[seat] / child.visits / scale;
  return mean + c * Math.sqrt(Math.log(child.avail + 1) / child.visits);
}
