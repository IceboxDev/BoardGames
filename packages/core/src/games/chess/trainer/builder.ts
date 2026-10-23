/**
 * Building an opening tree from the trainee's own games.
 *
 * - **Your positions** get exactly one move: within your first
 *   `handpickMoves` moves, the one you choose (a move, or "Best" = the
 *   engine's); after that, the engine's best. A choice you set anywhere
 *   (changing your move later) wins over the engine.
 * - **Opponent positions** get every move played against you there (by any
 *   route — transpositions count). The very first opponent move of the game
 *   (Black's reply to your first move, or White's first move) is exactly
 *   that; anywhere else, fewer than `minReplies` distinct moves are padded by
 *   `padReplies` (most popular, engine best, 2nd most popular, 2nd best, …).
 *   With the analysis farm, every opponent position is also sent for the
 *   engine's top three — so a played reply that is its best can be marked —
 *   without the build waiting for it.
 * - **How far:** a game *follows* the tree from the start until its own move
 *   differs from the tree's. A game that left it follows again from the first
 *   tree position it reaches later by another move order (a transposition):
 *   a position you meet is worth knowing however you got there, and its
 *   analysis is shared (positions are keyed by position, not by line). A
 *   position is expanded while some following game reaches it. An opponent move no following game took (padding, or a move
 *   only seen in games that had already left the tree) gets your reply and
 *   the opponent's replies to it (`extension` 3: those are leaves). A game
 *   that never leaves keeps its line growing to its last move.
 * - **Line ends:** where your games reached a position of yours but none
 *   played the tree's move, the line goes three steps further without them
 *   (`extension` on the nodes): 1 the opponent's replies to your move, 2 your
 *   answer to each, 3 the opponent's replies to those — the leaves.
 *
 * The build is resumable and cheap to repeat: everything slow (engine lines,
 * database moves, your choices) is cached on the nodes, so a rebuild with the
 * previous tree replays the games through the cached nodes and only asks the
 * providers about positions it hasn't seen. Choosing a move, changing one,
 * pulling new games or resuming after a pause are all just "rebuild".
 */
import { applyMove } from "../engine/apply";
import { parseFen, positionKey, START_FEN, toFen } from "../engine/fen";
import { legalMoves } from "../engine/movegen";
import { toSan } from "../engine/san";
import type { Color, Move, Position } from "../engine/types";
import { moveToUci } from "../engine/uci";
import { BEST_MOVE_SPEC, finalDepth } from "./eval-policy";
import { padReplies } from "./padding";
import { hashKey, MAX_PLIES, type PositionIndex } from "./position-index";
import type {
  EngineLine,
  Lc0Stat,
  PopularMove,
  RepertoireTree,
  TreeMove,
  TreeNode,
  TreeSettings,
  TreeStats,
} from "./tree";

/** Thrown by `TreeProviders.evaluate` for a position the farm hasn't analysed yet. */
export class EvalPending extends Error {
  constructor() {
    super("evaluation pending");
  }
}

/** A deep evaluation (the analysis farm, under `settings.evalSpec`). */
export interface NodeEval {
  /** Best first: for your positions, the move to play; for opponents', their top moves. */
  readonly lines: readonly EngineLine[];
  readonly source?: string;
  readonly ties?: readonly string[];
  readonly contested?: boolean;
  readonly lc0?: readonly Lc0Stat[];
}

export interface TreeProviders {
  /** The engine's best `multipv` lines from this position, best first. */
  engineLines(fen: string, multipv: number, depth: number): Promise<EngineLine[]>;
  /** The database's moves from this position, most played first. */
  popularMoves(fen: string): Promise<PopularMove[]>;
  /**
   * The deep evaluation under `settings.evalSpec`, or throw `EvalPending`
   * while the farm works on it. Used instead of `engineLines` when the
   * settings name a spec and this exists. `reach` = your games following the
   * tree into the position (it decides how deep the farm searches).
   */
  evaluate?(fen: string, kind: "user" | "opp", reach: number, stage?: number): Promise<NodeEval>;
}

export interface BuildProgress {
  /** Positions worked through (a position can be visited again when new games arrive). */
  readonly processed: number;
  readonly queued: number;
  readonly nodes: number;
  /** Games that have left the tree or ended. */
  readonly settled: number;
  /** Positions parked for the analysis farm so far. */
  readonly awaiting: number;
  readonly games: number;
  readonly engineCalls: number;
  readonly popularCalls: number;
}

export interface BuildOptions {
  /** Checked between positions; `true` stops the build (status `generating`). */
  shouldStop?: () => boolean;
  onProgress?: (p: BuildProgress) => void;
  /** Called every `checkpointEvery` positions with the tree so far. */
  onCheckpoint?: (tree: RepertoireTree) => void | Promise<void>;
  checkpointEvery?: number;
}

const PLY_BITS = 7;
const PLY_MASK = (1 << PLY_BITS) - 1;
const HISTORY_SIZE = 6;

type MutableNode = { -readonly [K in keyof TreeNode]: TreeNode[K] };

interface Work {
  readonly key: string;
  readonly pos: Position;
  readonly legal: readonly Move[];
  readonly node: MutableNode;
  /** Following games waiting here, packed `game << 7 | ply`. */
  inbox: number[];
  queued: boolean;
  determined: boolean;
  deviations: Map<string, number>;
  /** 0 on a game line; 1–3 a line end's extension (see the header). */
  ext: number;
}

const firstOpponentPly = (color: Color) => (color === "w" ? 1 : 0);
/** 1 for your first move, whichever colour you play. */
const userMoveNumber = (ply: number) => Math.floor(ply / 2) + 1;

export async function buildTree(
  index: PositionIndex,
  color: Color,
  settings: TreeSettings,
  previous: RepertoireTree | null,
  providers: TreeProviders,
  options: BuildOptions = {},
): Promise<RepertoireTree> {
  const games = index.games;
  const works = new Map<string, Work>();
  const queue: Work[] = [];
  let processed = 0;
  let engineCalls = 0;
  let popularCalls = 0;
  let deviated = 0;
  let ended = 0;
  let settledPlies = 0;
  const cache = previous && previous.color === color ? previous.nodes : {};
  // Transpositions: the tree's positions by hash, the games that left the tree
  // (game → the ply where they left), and the later positions they wait at.
  const workByHash = new Map<number, Work>();
  const left = new Map<number, number>();
  const waitingAt = new Map<number, number[]>();

  const enqueue = (w: Work) => {
    if (w.queued) return;
    w.queued = true;
    queue.push(w);
  };

  const workFor = (pos: Position, ply: number): Work => {
    const key = positionKey(pos);
    const existing = works.get(key);
    if (existing) return existing;
    const old = cache[key];
    const node: MutableNode = {
      fen: toFen(pos),
      ply,
      side: pos.turn === color ? "user" : "opp",
      status: "open",
      moves: [],
      following: 0,
      seen: 0,
    };
    if (old?.choice && node.side === "user") node.choice = old.choice;
    if (old?.engine) node.engine = old.engine;
    if (old?.evalSpec) node.evalSpec = old.evalSpec;
    if (old?.evalSource) node.evalSource = old.evalSource;
    if (old?.ties) node.ties = old.ties;
    if (old?.contested) node.contested = old.contested;
    if (old?.lc0) node.lc0 = old.lc0;
    if (old?.popular) node.popular = old.popular;
    const w: Work = {
      key,
      pos,
      legal: legalMoves(pos),
      node,
      inbox: [],
      queued: false,
      determined: false,
      deviations: new Map(),
      ext: 0,
    };
    works.set(key, w);
    const hash = hashKey(key);
    workByHash.set(hash, w);
    const waiters = waitingAt.get(hash);
    if (waiters) {
      waitingAt.delete(hash);
      for (const ref of waiters) {
        const gi = ref >>> PLY_BITS;
        const from = left.get(gi);
        if (from !== undefined && (ref & PLY_MASK) > from) rejoin(w, gi, ref & PLY_MASK);
      }
    }
    return w;
  };

  /** A game that left the tree follows it again from `w`, which it reaches at `ply`. */
  const rejoin = (w: Work, gi: number, ply: number) => {
    left.delete(gi);
    // On a game line again: whatever extension step it was, it grows like one.
    w.ext = 0;
    w.inbox.push(((gi << PLY_BITS) | ply) >>> 0);
    enqueue(w);
  };

  /**
   * A game just left the tree at `ply`: it rejoins at the first later position
   * of its own that is already in the tree, else waits at each of them for the
   * tree to reach one.
   */
  const leave = (gi: number, ply: number) => {
    const hashes = index.hashesOf(gi);
    for (let q = ply + 1; q < hashes.length; q++) {
      const at = workByHash.get(hashes[q] ?? 0);
      if (at) {
        rejoin(at, gi, q);
        return;
      }
    }
    left.set(gi, ply);
    for (let q = ply + 1; q < hashes.length; q++) {
      const h = hashes[q] ?? 0;
      const list = waitingAt.get(h);
      const ref = ((gi << PLY_BITS) | q) >>> 0;
      if (list) list.push(ref);
      else waitingAt.set(h, [ref]);
    }
  };

  const childOf = (w: Work, uci: string): Work | null => {
    if (w.node.ply + 1 >= MAX_PLIES) return null;
    const move = w.legal.find((m) => moveToUci(m) === uci);
    if (!move) return null;
    return workFor(applyMove(w.pos, move), w.node.ply + 1);
  };

  const sanOf = (w: Work, uci: string): string => {
    const move = w.legal.find((m) => moveToUci(m) === uci);
    return move ? toSan(w.pos, move, w.legal) : uci;
  };

  // The farm's current definition: nodes evaluated under an older one are asked again.
  const spec = settings.evalSpec ? BEST_MOVE_SPEC : null;
  let awaiting = 0;

  const engineFor = async (w: Work, multipv: number): Promise<EngineLine[]> => {
    if (spec && providers.evaluate) {
      const node = w.node;
      // Reused only when final: a shallower result (an older farm's capped
      // search) is asked for again, and the build follows whatever replaces it.
      if (
        node.engine &&
        node.evalSpec === spec &&
        (node.engine[0]?.depth ?? 0) >= finalDepth(node.side, w.inbox.length)
      )
        return node.engine;
      engineCalls++;
      const r = await providers.evaluate(node.fen, node.side, w.inbox.length, w.ext);
      node.engine = r.lines.slice(0, 12);
      node.evalSpec = spec;
      if (r.source) node.evalSource = r.source;
      if (r.ties && r.ties.length > 1) node.ties = [...r.ties];
      if (r.contested) node.contested = true;
      if (r.lc0 && r.lc0.length > 0) node.lc0 = r.lc0.slice(0, 12);
      return node.engine;
    }
    const want = Math.min(multipv, w.legal.length);
    const cached = w.node.engine;
    if (cached && cached.length >= want && (cached[0]?.depth ?? 0) >= settings.engineDepth) {
      return cached;
    }
    engineCalls++;
    const lines = await providers.engineLines(w.node.fen, want, settings.engineDepth);
    w.node.engine = lines.slice(0, 12);
    return lines;
  };

  const popularFor = async (w: Work): Promise<PopularMove[]> => {
    if (w.node.popular) return w.node.popular;
    popularCalls++;
    const moves = (await providers.popularMoves(w.node.fen)).slice(0, 12);
    w.node.popular = moves;
    return moves;
  };

  const legalSet = (w: Work) => new Set(w.legal.map(moveToUci));

  /** Work out a position's moves. Returns false when it waits (for your choice or the farm). */
  const determine = async (w: Work): Promise<boolean> => {
    if (w.determined) return w.node.status !== "decision" && w.node.status !== "awaiting-eval";
    try {
      return await work(w);
    } catch (err) {
      if (!(err instanceof EvalPending)) throw err;
      w.node.status = "awaiting-eval";
      w.node.moves = [];
      w.determined = true;
      awaiting++;
      return false;
    }
  };

  const work = async (w: Work): Promise<boolean> => {
    const node = w.node;
    const stats = index.movesFrom(w.key);
    const legal = legalSet(w);
    const played = stats.filter((s) => legal.has(s.uci));
    node.seen = played.reduce((n, s) => n + s.games, 0);
    const countOf = (uci: string) => played.find((s) => s.uci === uci)?.games ?? 0;

    if (w.legal.length === 0) {
      node.status = "terminal";
      w.determined = true;
      return true;
    }

    if (node.side === "user") {
      node.history = played.slice(0, HISTORY_SIZE).map((s) => ({
        uci: s.uci,
        san: sanOf(w, s.uci),
        games: s.games,
        score: s.score,
      }));
      let uci: string | null = null;
      let source: TreeMove["source"] = "engine";
      const choice = node.choice;
      if (choice?.source === "handpicked" && legal.has(choice.uci)) {
        uci = choice.uci;
        source = "handpicked";
      } else if (choice?.source === "best") {
        source = "best";
      } else if (userMoveNumber(node.ply) <= settings.handpickMoves) {
        node.status = "decision";
        w.determined = true;
        return false;
      }
      if (uci === null) {
        const best = (await engineFor(w, 1))[0]?.uci;
        uci = best && legal.has(best) ? best : moveToUci(w.legal[0] as Move);
      }
      node.moves = [{ uci, san: sanOf(w, uci), source, games: countOf(uci), following: 0 }];
    } else {
      const observed = played.map((s) => s.uci);
      let replies: { uci: string; source: TreeMove["source"] }[];
      if (
        observed.length >= settings.minReplies ||
        (node.ply === firstOpponentPly(color) && observed.length > 0)
      ) {
        replies = observed.map((uci) => ({ uci, source: "played" }));
        // With the farm, these get the engine's verdict too (is a played reply
        // its best?) — without holding the tree up: the build carries on from
        // the played replies and the result arrives in a later pass.
        if (spec && providers.evaluate) {
          try {
            await engineFor(w, settings.minReplies);
          } catch (err) {
            if (!(err instanceof EvalPending)) throw err;
          }
        }
      } else {
        const engine = await engineFor(w, settings.minReplies + observed.length);
        const popular = await popularFor(w);
        replies = padReplies(
          observed,
          engine.map((l) => l.uci),
          popular.map((p) => p.uci),
          legal,
          settings.minReplies,
        );
      }
      node.moves = replies.map((r) => ({
        uci: r.uci,
        san: sanOf(w, r.uci),
        source: r.source,
        games: countOf(r.uci),
        following: 0,
      }));
      // Every reply gets your answer, whether or not a following game reaches it —
      // except at the extension's last step: those replies are the leaves.
      if (w.ext !== 3) {
        for (const r of replies) {
          const child = childOf(w, r.uci);
          if (!child) continue;
          if (w.ext === 1 && child.ext === 0 && child.inbox.length === 0) child.ext = 2;
          if (!child.determined) enqueue(child);
        }
      }
    }
    node.status = "done";
    w.determined = true;
    return true;
  };

  const settle = (ply: number) => {
    settledPlies += ply;
  };

  /** Send the following games waiting at `w` on down the tree. */
  const consume = (w: Work) => {
    const node = w.node;
    const inbox = w.inbox;
    w.inbox = [];
    for (const ref of inbox) {
      const gi = ref >>> PLY_BITS;
      const ply = ref & PLY_MASK;
      const game = games[gi];
      if (!game) continue;
      node.following++;
      const uci = game.moves[ply];
      if (uci === undefined || ply + 1 >= MAX_PLIES || node.status === "terminal") {
        node.ended = (node.ended ?? 0) + 1;
        ended++;
        settle(ply);
        continue;
      }
      let move = node.moves.find((m) => m.uci === uci);
      if (!move && node.side === "user") {
        w.deviations.set(uci, (w.deviations.get(uci) ?? 0) + 1);
        deviated++;
        settle(ply);
        leave(gi, ply);
        continue;
      }
      if (!move) {
        // Only a hash collision in the index can hide a played move.
        move = { uci, san: sanOf(w, uci), source: "played", games: 1, following: 0 };
        node.moves.push(move);
      }
      move.following++;
      const child = childOf(w, uci);
      if (!child) {
        node.ended = (node.ended ?? 0) + 1;
        ended++;
        settle(ply);
        continue;
      }
      child.inbox.push(((gi << PLY_BITS) | (ply + 1)) >>> 0);
      enqueue(child);
    }
  };

  /**
   * After your position is worked out: a line end (your games reached it, none
   * played the tree's move) starts the extension; an extension answer, or your
   * answer to a reply no following game took, leads to a last opponent
   * position whose replies are leaves.
   */
  const extend = (w: Work) => {
    const node = w.node;
    if (node.side !== "user" || node.status !== "done") return;
    const move = node.moves[0];
    if (!move) return;
    const lineEnd = w.ext === 0 && node.following > 0 && move.following === 0;
    const offLine = w.ext === 0 && node.following === 0;
    if (!lineEnd && !offLine && w.ext !== 2) return;
    const child = childOf(w, move.uci);
    if (!child || child.ext !== 0 || child.inbox.length > 0 || child.determined) return;
    child.ext = lineEnd ? 1 : 3;
    enqueue(child);
  };

  const root = workFor(parseFen(START_FEN), 0);
  root.inbox = games.flatMap((g, gi) => (g.moves.length > 0 ? [(gi << PLY_BITS) >>> 0] : []));
  enqueue(root);

  const progress = (): BuildProgress => ({
    processed,
    queued: queue.length,
    nodes: works.size,
    settled: deviated + ended,
    awaiting,
    games: games.length,
    engineCalls,
    popularCalls,
  });

  const materialize = (stopped: boolean): RepertoireTree => {
    const nodes: Record<string, TreeNode> = {};
    let waiting = 0;
    let decisions = 0;
    for (const w of works.values()) {
      const node: MutableNode = { ...w.node };
      if (node.status === "decision") {
        decisions++;
        waiting += w.inbox.length;
        node.following += w.inbox.length;
      }
      if (node.status === "awaiting-eval") node.following += w.inbox.length;
      if (w.ext > 0) node.extension = w.ext;
      if (w.deviations.size > 0) {
        node.deviations = [...w.deviations]
          .map(([uci, n]) => ({ uci, san: sanOf(w, uci), games: n }))
          .sort((a, b) => b.games - a.games);
      }
      nodes[w.key] = node;
    }
    const settled = deviated + ended;
    const stats: TreeStats = {
      games: games.length,
      deviated,
      ended,
      waiting,
      avgFollowPlies: settled > 0 ? Math.round((settledPlies / settled) * 10) / 10 : 0,
      decisions,
      awaiting,
    };
    return {
      formatVersion: 1,
      color,
      settings,
      status: stopped
        ? "generating"
        : awaiting > 0
          ? "analysing"
          : decisions > 0
            ? "decisions"
            : "ready",
      root: root.key,
      nodes,
      stats,
    };
  };

  const every = options.checkpointEvery ?? 25;
  let stopped = false;
  while (queue.length > 0) {
    if (options.shouldStop?.()) {
      stopped = true;
      break;
    }
    const w = queue.shift() as Work;
    w.queued = false;
    const ready = await determine(w);
    if (ready) {
      consume(w);
      extend(w);
    }
    processed++;
    options.onProgress?.(progress());
    if (options.onCheckpoint && processed % every === 0)
      await options.onCheckpoint(materialize(true));
  }
  return materialize(stopped);
}
