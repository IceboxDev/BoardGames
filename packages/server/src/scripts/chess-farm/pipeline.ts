/**
 * BEST_MOVE_V1 on the farm (see core/games/chess/trainer/eval-policy.ts):
 *
 *   your move  lichess cloud if it is already as deep as the tier asks; else
 *              candidates (ChessDB's ranking, or a quick MultiPV-3 search),
 *              Stockfish single-PV to the tier depth on the best and each
 *              candidate (`searchmoves`), Lc0 on the GPU at the same time for
 *              the tie-break and the "contested" check.
 *   opponent   lichess cloud with 3 lines at the opponent depth, else
 *              Stockfish MultiPV 3 to that depth.
 */
import { parseFen } from "@boardgames/core/games/chess/engine/fen";
import { legalMoves } from "@boardgames/core/games/chess/engine/movegen";
import { moveToUci } from "@boardgames/core/games/chess/engine/uci";
import {
  BEST_MOVE_SPEC,
  BEST_MOVE_V1,
  candidates,
  type Lc0Move,
  pickBest,
  type Scored,
  scoreValue,
  type Tier,
  tierOf,
} from "@boardgames/core/games/chess/trainer/eval-policy";
import type { FarmJob, FarmLine, PositionEval } from "@boardgames/core/protocol";
import { chessdbMoves, type LookupLine, lichessCloud } from "./lookups.ts";
import { finalLines, type InfoLine, parseLc0MoveStat, type UciEngine } from "./uci.ts";

export interface FarmPolicy {
  readonly tiers: readonly Tier[];
  readonly oppDepth: number;
  /** Node cap per target depth (from calibration); a search stops at whichever comes first. */
  readonly nodeCap: (depth: number) => number;
  readonly prepassDepth: number;
  readonly lc0Nodes: number;
  /** Most extra candidates searched to full depth per position. */
  readonly maxCandidates: number;
  /** Ask lichess/ChessDB first (off for calibration runs). */
  readonly lookups: boolean;
}

export const defaultPolicy = (nps: number): FarmPolicy => ({
  tiers: BEST_MOVE_V1.tiers,
  oppDepth: BEST_MOVE_V1.opp.depth,
  // Uncalibrated: at most ten minutes of search per run.
  nodeCap: () => Math.round(nps * 600),
  prepassDepth: 24,
  lc0Nodes: BEST_MOVE_V1.lc0Nodes,
  maxCandidates: 2,
  lookups: true,
});

/** Lc0 behind a queue: one search at a time on the GPU. */
export class Lc0Lane {
  private tail: Promise<unknown> = Promise.resolve();
  constructor(readonly engine: UciEngine) {}

  rootStats(fen: string, nodes: number): Promise<Lc0Move[]> {
    const run = async () => {
      const r = await this.engine.search(fen, `nodes ${nodes}`, { timeoutMs: 30 * 60_000 });
      return r.strings.flatMap((s) => {
        const m = parseLc0MoveStat(s);
        return m ? [m] : [];
      });
    };
    const next = this.tail.then(run, run);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

export interface FarmEngines {
  readonly sf: UciEngine;
  readonly lc0: Lc0Lane | null;
  /** e.g. "stockfish dev-20261013-5c4cef0b + lc0 0.33 BT4-it332". */
  readonly label: string;
}

const toLine = (i: InfoLine): FarmLine => ({
  uci: i.pv[0] as string,
  cp: i.cp,
  mate: i.mate,
  depth: i.depth,
  seldepth: i.seldepth,
  nodes: i.nodes,
  pv: i.pv.slice(0, 24),
});

const fromLookup = (l: LookupLine): FarmLine => ({
  uci: l.uci,
  cp: l.cp,
  mate: l.mate,
  depth: l.depth,
  seldepth: null,
  nodes: null,
  pv: [...l.pv],
});

function rank(lines: FarmLine[]): FarmLine[] {
  return [...lines].sort((a, b) => scoreValue(b) - scoreValue(a));
}

async function sfLines(
  engines: FarmEngines,
  fen: string,
  go: string,
  multipv: number,
): Promise<FarmLine[]> {
  engines.sf.setOption("MultiPV", multipv);
  const r = await engines.sf.search(fen, go, { timeoutMs: 6 * 3600_000 });
  if (multipv !== 1) engines.sf.setOption("MultiPV", 1);
  return finalLines(r.infos).map(toLine);
}

export async function analyse(
  job: FarmJob,
  engines: FarmEngines,
  policy: FarmPolicy,
): Promise<PositionEval> {
  const start = Date.now();
  const legal = new Set(legalMoves(parseFen(job.fen)).map(moveToUci));
  if (legal.size === 0) throw new Error("no legal moves");
  const base = {
    fen: job.fen,
    kind: job.kind,
    spec: BEST_MOVE_SPEC,
    engine: engines.label,
  } as const;
  const done = (fields: Omit<PositionEval, keyof typeof base | "seconds">): PositionEval => ({
    ...base,
    ...fields,
    seconds: (Date.now() - start) / 1000,
  });

  if (job.kind === "opp") {
    const want = Math.min(3, legal.size);
    if (policy.lookups) {
      const cloud = await lichessCloud(job.fen, want, legal);
      if (cloud && cloud.length >= want && (cloud[0]?.depth ?? 0) >= policy.oppDepth) {
        const lines = rank(cloud.map(fromLookup));
        return done({
          best: lines[0]?.uci as string,
          lines,
          lc0: null,
          ties: [],
          contested: false,
          depth: lines[0]?.depth ?? 0,
          source: "lichess-cloud",
        });
      }
    }
    const depth = policy.oppDepth;
    const lines = await sfLines(
      engines,
      job.fen,
      `depth ${depth} nodes ${policy.nodeCap(depth) * 2}`,
      want,
    );
    if (lines.length === 0) throw new Error("Stockfish gave no lines");
    return done({
      best: lines[0]?.uci as string,
      lines,
      lc0: null,
      ties: [],
      contested: false,
      depth: lines[0]?.depth ?? 0,
      source: "farm",
    });
  }

  // ── Your move ──
  const target = tierOf(job.reach, policy.tiers).depth;
  const lc0Promise = engines.lc0?.rootStats(job.fen, policy.lc0Nodes) ?? Promise.resolve([]);

  const choose = (lines: FarmLine[], lc0: Lc0Move[], source: PositionEval["source"]) => {
    const searched: Scored[] = lines.map((l) => ({ uci: l.uci, cp: l.cp, mate: l.mate }));
    const pick = pickBest(searched, lc0.length > 0 ? lc0 : []);
    return done({
      best: pick.best,
      lines: rank(lines),
      lc0: lc0.length > 0 ? lc0.sort((a, b) => b.visits - a.visits).slice(0, 12) : null,
      ties: [...pick.ties],
      contested: pick.contested,
      depth: Math.max(...lines.map((l) => l.depth)),
      source,
    });
  };

  if (policy.lookups) {
    const cloud = await lichessCloud(job.fen, 3, legal);
    if (cloud && cloud.length > 0 && (cloud[0]?.depth ?? 0) >= target) {
      return choose(cloud.map(fromLookup), await lc0Promise.catch(() => []), "lichess-cloud");
    }
  }

  // Candidates worth a full-depth search.
  let cands: string[] = [];
  if (policy.lookups) {
    const cdb = await chessdbMoves(job.fen, legal);
    if (cdb && cdb.length > 0) {
      cands = candidates(cdb.map((m) => ({ uci: m.uci, cp: m.score, mate: null })));
    }
  }
  if (cands.length === 0) {
    const pre = await sfLines(
      engines,
      job.fen,
      `depth ${policy.prepassDepth}`,
      Math.min(3, legal.size),
    );
    cands = candidates(pre.map((l) => ({ uci: l.uci, cp: l.cp, mate: l.mate })));
  }

  const cap = policy.nodeCap(target);
  const main = await sfLines(engines, job.fen, `depth ${target} nodes ${cap}`, 1);
  if (main.length === 0) throw new Error("Stockfish gave no line");
  const lines: FarmLine[] = [main[0] as FarmLine];
  for (const c of cands.filter((u) => u !== main[0]?.uci).slice(0, policy.maxCandidates)) {
    const alt = await sfLines(engines, job.fen, `depth ${target} nodes ${cap} searchmoves ${c}`, 1);
    if (alt[0]) lines.push(alt[0]);
  }
  return choose(lines, await lc0Promise.catch(() => []), "farm");
}
