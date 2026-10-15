/**
 * BEST_MOVE_V1 — what "the best move" means in an opening tree, and how much
 * search each position gets. Every stored evaluation names the spec it was
 * made under, so a later definition can be told apart and re-run.
 *
 * Your move: Stockfish, single-PV, to a depth set by how many of your games
 * reach the position (its "tier"). Moves within `candidateMarginCp` of the
 * top are searched to the same depth; those ending within `tieMarginCp` of
 * the best are a tie, broken by Lc0's win-minus-loss for you. Opponent
 * padding: Stockfish MultiPV 3 at `opp.depth` (no tie-break — every one of
 * the three is used).
 */

export const BEST_MOVE_SPEC = "BEST_MOVE_V1";

export type TierName = "trunk" | "main" | "rare" | "leaf";

export interface Tier {
  readonly name: TierName;
  /** The fewest of your games that must reach a position for this tier. */
  readonly minReach: number;
  readonly depth: number;
}

export const BEST_MOVE_V1 = {
  candidateMarginCp: 25,
  tieMarginCp: 15,
  /** Lc0's choice scoring this much worse by Stockfish marks the position contested. */
  contestedCp: 50,
  lc0Nodes: 1_000_000,
  tiers: [
    { name: "trunk", minReach: 20, depth: 50 },
    { name: "main", minReach: 3, depth: 45 },
    { name: "rare", minReach: 1, depth: 42 },
    { name: "leaf", minReach: 0, depth: 38 },
  ] as readonly Tier[],
  opp: { depth: 40, multipv: 3 },
  /** ChessDB's ranking replaces the opponent search when its PV is at least this deep. */
  chessdbOppMinDepth: 36,
} as const;

export function tierOf(reach: number, tiers: readonly Tier[] = BEST_MOVE_V1.tiers): Tier {
  return tiers.find((t) => reach >= t.minReach) ?? (tiers.at(-1) as Tier);
}

/** A score from the side to move, comparable across cp and mate. */
export interface Scored {
  readonly uci: string;
  readonly cp: number | null;
  readonly mate: number | null;
}

const MATE = 100_000;

/** One number per score: a mate in n beats every cp score, a shorter mate a longer one. */
export function scoreValue(s: Pick<Scored, "cp" | "mate">): number {
  if (s.mate !== null) {
    if (s.mate > 0) return MATE - s.mate;
    return -MATE - s.mate; // mated in |m|: being mated sooner is worse
  }
  return s.cp ?? 0;
}

/** Lc0's view of one root move, from the side to move (probabilities 0–1). */
export interface Lc0Move {
  readonly uci: string;
  readonly w: number;
  readonly d: number;
  readonly l: number;
  readonly visits: number;
}

export interface BestChoice {
  readonly best: string;
  /** The moves within the tie margin of Stockfish's best (best included). */
  readonly ties: readonly string[];
  /** Whether Lc0 decided between ties. */
  readonly byLc0: boolean;
  /** Lc0's own favourite scores `contestedCp` worse by Stockfish. */
  readonly contested: boolean;
}

/**
 * The move to play, from Stockfish's searched moves (each to full depth) and,
 * when they tie, Lc0's root statistics.
 */
export function pickBest(
  searched: readonly Scored[],
  lc0: readonly Lc0Move[] = [],
  spec = BEST_MOVE_V1,
): BestChoice {
  if (searched.length === 0) throw new Error("pickBest: nothing searched");
  const ranked = [...searched].sort((a, b) => scoreValue(b) - scoreValue(a));
  const top = ranked[0] as Scored;
  const topValue = scoreValue(top);
  // Mates are never "close": only cp scores tie.
  const ties =
    top.mate !== null
      ? [top.uci]
      : ranked
          .filter((s) => s.mate === null && topValue - scoreValue(s) <= spec.tieMarginCp)
          .map((s) => s.uci);

  let best = top.uci;
  let byLc0 = false;
  if (ties.length > 1) {
    const stats = new Map(lc0.map((m) => [m.uci, m]));
    const rated = ties.filter((u) => stats.has(u));
    if (rated.length > 0) {
      rated.sort((a, b) => {
        const x = stats.get(a) as Lc0Move;
        const y = stats.get(b) as Lc0Move;
        return y.w - y.l - (x.w - x.l) || x.d - y.d || ties.indexOf(a) - ties.indexOf(b);
      });
      best = rated[0] as string;
      byLc0 = best !== top.uci;
    }
  }

  let contested = false;
  const lc0Top = [...lc0].sort((a, b) => b.visits - a.visits)[0];
  if (lc0Top) {
    const sf = searched.find((s) => s.uci === lc0Top.uci);
    contested = !sf || topValue - scoreValue(sf) > spec.contestedCp;
  }
  return { best, ties, byLc0, contested };
}

/** The moves worth a full-depth search: within the candidate margin of the top (cheap) score. */
export function candidates(preview: readonly Scored[], spec = BEST_MOVE_V1): string[] {
  if (preview.length === 0) return [];
  const ranked = [...preview].sort((a, b) => scoreValue(b) - scoreValue(a));
  const top = scoreValue(ranked[0] as Scored);
  if ((ranked[0] as Scored).mate !== null) return [(ranked[0] as Scored).uci];
  return ranked
    .filter((s) => s.mate === null && top - scoreValue(s) <= spec.candidateMarginCp)
    .map((s) => s.uci);
}

// ── Budget ──────────────────────────────────────────────────────────────

/** Measured on the farm: nodes to reach `depth` from a typical tree position. */
export interface Calibration {
  /** Engine speed, nodes per second, with every thread searching. */
  readonly nps: number;
  /** Median nodes to reach each measured depth (single-PV). */
  readonly nodesToDepth: Readonly<Record<number, number>>;
  /** MultiPV 3 cost relative to single-PV at the same depth. */
  readonly multipv3Factor: number;
  /** Extra searches per position from near-tie candidates (mean, e.g. 0.6). */
  readonly candidateFactor: number;
}

/** Nodes to `depth`, interpolating geometrically between measured depths. */
export function nodesAt(cal: Calibration, depth: number): number {
  const known = Object.keys(cal.nodesToDepth)
    .map(Number)
    .sort((a, b) => a - b);
  if (known.length === 0) throw new Error("calibration has no depths");
  const at = (d: number) => cal.nodesToDepth[d] as number;
  if (cal.nodesToDepth[depth] !== undefined) return at(depth);
  let lo = known[0] as number;
  let hi = known.at(-1) as number;
  for (const d of known) {
    if (d <= depth) lo = d;
    if (d >= depth) {
      hi = d;
      break;
    }
  }
  if (lo === hi) {
    // Outside the measured range: extend with the branching factor of the nearest pair.
    const [a, b] = depth < lo ? [known[0], known[1]] : [known.at(-2), known.at(-1)];
    if (a === undefined || b === undefined) return at(lo);
    const ebf = (at(b) / at(a)) ** (1 / (b - a));
    return at(lo) * ebf ** (depth - lo);
  }
  const t = (depth - lo) / (hi - lo);
  return at(lo) * (at(hi) / at(lo)) ** t;
}

export interface Workload {
  /** Your positions per tier still to search (lookups already removed). */
  readonly user: Readonly<Record<TierName, number>>;
  /** Opponent positions still to search. */
  readonly opp: number;
}

/** Seconds of farm time for a workload at these tier depths. */
export function projectSeconds(
  cal: Calibration,
  work: Workload,
  tiers: readonly Tier[],
  oppDepth: number,
): number {
  let nodes = 0;
  for (const t of tiers) {
    nodes += (work.user[t.name] ?? 0) * nodesAt(cal, t.depth) * (1 + cal.candidateFactor);
  }
  nodes += work.opp * nodesAt(cal, oppDepth) * cal.multipv3Factor;
  return nodes / cal.nps;
}

/**
 * Tier depths that fit `budgetSeconds`. Over budget: one ply off each of
 * leaf, rare, main and the opponent search in turn (never the trunk, never
 * below `floor`) until it fits. With time to spare: main, then rare, raised a
 * ply at a time toward the trunk's depth.
 */
export function allocateDepths(
  cal: Calibration,
  work: Workload,
  budgetSeconds: number,
  spec = BEST_MOVE_V1,
  floor = 30,
): { tiers: Tier[]; oppDepth: number; seconds: number } {
  const depth: Record<TierName, number> = { trunk: 0, main: 0, rare: 0, leaf: 0 };
  for (const t of spec.tiers) depth[t.name] = t.depth;
  let oppDepth: number = spec.opp.depth;
  const tiers = () => spec.tiers.map((t) => ({ ...t, depth: depth[t.name] }));
  const cost = () => projectSeconds(cal, work, tiers(), oppDepth);

  const order = ["leaf", "rare", "main", "opp"] as const;
  let i = 0;
  let stuck = 0;
  while (cost() > budgetSeconds && stuck < order.length) {
    const which = order[i % order.length] as (typeof order)[number];
    i++;
    if (which === "opp") {
      if (oppDepth > floor) {
        oppDepth--;
        stuck = 0;
      } else stuck++;
    } else if (depth[which] > floor) {
      depth[which]--;
      stuck = 0;
    } else stuck++;
  }
  for (const name of ["main", "rare"] as const) {
    while (depth[name] < depth.trunk) {
      depth[name]++;
      if (cost() > budgetSeconds) {
        depth[name]--;
        break;
      }
    }
  }
  return { tiers: tiers(), oppDepth, seconds: cost() };
}
