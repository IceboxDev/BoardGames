// Single-observer ISMCTS over the trick phase with max^n (per-seat value
// vector) backups, subset-UCT availability counts, Daimyō playouts and an
// exact max^n tail. One tree per decision; every iteration re-deals the
// hidden cards, so the tree's statistics average over the observer's
// information set. See plan "Tenka" and README notes in ./config.ts.

import { createRng } from "../../../lib/rng";
import { addSearchWork, voidsOf } from "../ai-search";
import type { Action, GameState } from "../types";
import { buildKeyTable } from "./action-keys";
import type { TenkaConfig } from "./config";
import { solveExact, solveRootPimc } from "./endgame-solver";
import {
  applyFast,
  buildRoot,
  CARD_ID,
  CARD_INDEX,
  cloneFast,
  type FastRound,
  fastFromState,
  fastPickPlay,
  legalInto,
  N_CARDS,
  redeterminize,
  resetFrom,
  strengthOf,
} from "./fast-round";
import { roundHistory, worldLogWeight } from "./inference";
import { LeafValuer } from "./leaf-value";
import { OPPONENT_MODEL } from "./opponent-weights";
import { FEATURES, learnedPickPlay, MAX_HIDDEN } from "./policy";
import { POLICY_MODEL } from "./policy-weights";
import { backup, createNode, type TenkaNode, uct } from "./tree";

export interface TenkaStats {
  mode: "forced" | "exact" | "tree";
  iterations: number;
  nodes: number;
  /** Root children: key → [visits, mean value for the root seat]. */
  root: Record<string, [number, number]>;
  ms: number;
}

type PlayAction = Extract<Action, { type: "play" }>;

const MAX_DEPTH = 5 * 13 + 2;
const LEGAL_BUFS: Int8Array[] = Array.from({ length: MAX_DEPTH }, () => new Int8Array(13));
const TT_MAX = 60_000;

function decisionRng(state: GameState, salt: number) {
  const point =
    state.round * 10_000 + state.trickNumber * 100 + state.table.length * 10 + state.played.length;
  return createRng((state.seed ^ Math.imul(point + salt, 0x9e3779b1)) | 0);
}

export function pickPlayTenka(
  state: GameState,
  legal: Action[],
  seat: number,
  cfg: TenkaConfig,
): { action: Action; stats: TenkaStats } {
  const t0 = performance.now();
  const plays = legal.filter((a): a is PlayAction => a.type === "play");
  const done = (action: Action, stats: Omit<TenkaStats, "ms">) => ({
    action,
    stats: { ...stats, ms: performance.now() - t0 },
  });
  if (plays.length === 0)
    return done(legal[0], { mode: "forced", iterations: 0, nodes: 0, root: {} });
  if (plays.length === 1)
    return done(plays[0], { mode: "forced", iterations: 0, nodes: 0, root: {} });

  const n = state.players.length;
  const root = buildRoot(state, seat, voidsOf(state));
  if (cfg.cheat) {
    // Bench diagnostic: every hand known, only the undealt cards stay OUT.
    root.base = fastFromState(state, -1);
    root.unseen = new Int8Array(0);
  }
  const keys = buildKeyTable(root.base, seat, cfg.opponentBuckets);
  const leaf = new LeafValuer(state, cfg.leaf);
  const rng = decisionRng(state, 11);
  const tau = cfg.inference * (cfg.inferencePerOpponent ? Math.max(1, n - 1) : 1);

  // Own candidates: one representative per equivalence class.
  const candidates: number[] = [];
  const candidateAction = new Map<number, PlayAction>();
  for (const play of plays) {
    const card = CARD_INDEX[play.card];
    const rep = keys.ownRep.get(keys.own[card]) ?? card;
    if (!candidateAction.has(rep)) {
      candidates.push(rep);
      candidateAction.set(rep, play);
    }
  }
  // The representative is the lowest class member, which is legal whenever any member is.
  for (const rep of candidates) {
    const exact = plays.find((p) => CARD_INDEX[p.card] === rep);
    if (exact) candidateAction.set(rep, exact);
  }
  if (candidates.length === 1) {
    return done(candidateAction.get(candidates[0]) as Action, {
      mode: "forced",
      iterations: 0,
      nodes: 0,
      root: {},
    });
  }

  // Short rounds: exact PIMC over sampled worlds (as many as the budget allows).
  const deadline = cfg.timeMs > 0 ? t0 + cfg.timeMs : Number.POSITIVE_INFINITY;
  if (root.base.cardsLeft <= cfg.rootSolvePlies) {
    let logWeight: ((f: FastRound) => number) | undefined;
    if (cfg.inference > 0 && !cfg.cheat) {
      const hist = roundHistory(state);
      const h = cloneFast(root.base);
      const buf = new Int8Array(13);
      const feats = new Float32Array(13 * FEATURES);
      const scores = new Float32Array(13);
      const hidden = new Float32Array(MAX_HIDDEN);
      logWeight = (f) =>
        worldLogWeight(
          f,
          seat,
          hist,
          root.voidMask,
          OPPONENT_MODEL,
          tau,
          cfg.inferenceFloor,
          h,
          buf,
          feats,
          scores,
          hidden,
        );
    }
    const { card, totals, dets } = solveRootPimc(
      root,
      candidates,
      cfg.rootSolveDets,
      rng,
      leaf,
      deadline,
      4,
      logWeight,
    );
    addSearchWork(dets);
    const stats: Record<string, [number, number]> = {};
    for (const [c, mean] of totals) stats[CARD_ID[c]] = [dets, mean];
    return done(candidateAction.get(card) as Action, {
      mode: "exact",
      iterations: dets,
      nodes: 0,
      root: stats,
    });
  }

  const tree = createNode("root", seat, n);
  let nodes = 1;
  const f = cloneFast(root.base);
  const scratch = new Int8Array(N_CARDS);
  const dealt = new Int8Array(N_CARDS);
  const path: TenkaNode[] = [];
  const tt = new Map<string, Float64Array>();
  const keyBuf: string[] = new Array(13);
  const cardBuf = new Int8Array(13);
  const presentBuf: TenkaNode[] = new Array(13);
  const featScratch = new Float32Array(13 * FEATURES);
  const learned = cfg.playout === "learned";
  // Likelihood weighting (paired root only): running log-sum-exp accumulators.
  const inference = cfg.rootPaired && cfg.inference > 0 && !cfg.cheat;
  const hist = inference ? roundHistory(state) : null;
  const hScratch = inference ? cloneFast(root.base) : null;
  const rootW = new Float64Array(candidates.length);
  const rootWV = new Float64Array(candidates.length);
  let maxLog = Number.NEGATIVE_INFINITY;
  let lastValue = 0;
  const scoreScratch = new Float32Array(13);
  const hiddenScratch = new Float32Array(MAX_HIDDEN);
  const policy = (s: number, buf: Int8Array, count: number): number =>
    learned
      ? learnedPickPlay(
          f,
          s,
          buf,
          count,
          root.voidMask,
          POLICY_MODEL,
          featScratch,
          scoreScratch,
          hiddenScratch,
        )
      : fastPickPlay(f, s, buf, count, cfg.playoutHonest);
  let iterations = 0;

  /** One descent from `node` (already on `path`) in the current world, then playout and backup. */
  const descend = (start: TenkaNode, startDepth: number): void => {
    let node = start;
    let depth = startDepth;

    // Selection / expansion.
    while (f.cardsLeft > 0) {
      const s = f.turn;
      const buf = LEGAL_BUFS[depth];
      const count = legalInto(f, s, buf);
      const table = s === seat ? keys.own : keys.other;
      // Distinct keys in this world (≤ 13), lowest card first per key.
      let m = 0;
      for (let i = 0; i < count; i++) {
        const card = buf[i];
        const key = table[card];
        let j = 0;
        for (; j < m; j++) if (keyBuf[j] === key) break;
        if (j === m) {
          keyBuf[m] = key;
          cardBuf[m] = card;
          m++;
        } else if (strengthOf(card, f.trump) < strengthOf(cardBuf[j], f.trump)) {
          cardBuf[j] = card;
        }
      }
      // Availability + untried detection.
      let untried = -1;
      let present = 0;
      for (let j = 0; j < m; j++) {
        const child = node.children.get(keyBuf[j]);
        if (child) {
          child.avail++;
          presentBuf[present++] = child;
        } else if (untried === -1) {
          untried = j;
        }
      }
      if (untried !== -1 && nodes < cfg.maxNodes) {
        let pick = untried;
        if (cfg.heuristicFirst) {
          const hk = table[policy(s, buf, count)];
          for (let j = 0; j < m; j++) {
            if (keyBuf[j] === hk && !node.children.has(hk)) {
              pick = j;
              break;
            }
          }
        }
        const next = createNode(keyBuf[pick], s, n);
        node.children.set(keyBuf[pick], next);
        nodes++;
        applyFast(f, cardBuf[pick]);
        path.push(next);
        depth++;
        break; // expanded exactly one node → playout
      }
      if (present === 0) break; // node cap reached with nothing tried here

      // Subset-UCT over the children available in this world.
      let best = presentBuf[0];
      let bestScore = Number.NEGATIVE_INFINITY;
      for (let j = 0; j < present; j++) {
        const child = presentBuf[j];
        const score = uct(child, s, cfg.c, cfg.valueScale);
        if (score > bestScore) {
          bestScore = score;
          best = child;
        }
      }
      let chosenCard = cardBuf[0];
      for (let j = 0; j < m; j++) {
        if (keyBuf[j] === best.key) {
          chosenCard = cardBuf[j];
          break;
        }
      }
      applyFast(f, chosenCard);
      path.push(best);
      node = best;
      depth++;
    }

    // Playout with the heuristic policy, then the exact tail.
    while (f.cardsLeft > cfg.solvePlies) {
      const s = f.turn;
      const buf = LEGAL_BUFS[depth];
      const count = legalInto(f, s, buf);
      const card =
        cfg.epsilon > 0 && rng() < cfg.epsilon
          ? buf[Math.floor(rng() * count)]
          : policy(s, buf, count);
      applyFast(f, card);
      depth++;
    }
    if (tt.size > TT_MAX) tt.clear();
    const v = f.cardsLeft > 0 ? solveExact(f, leaf, tt, depth) : leaf.value(f.tricksWon);
    backup(path, v);
    lastValue = v[seat];
    iterations++;
  };

  while (iterations < cfg.iterations) {
    if (performance.now() > deadline) break;
    resetFrom(f, root.base);
    if (!cfg.cheat) redeterminize(f, root, rng, scratch);
    if (!cfg.rootPaired) {
      path.length = 0;
      path.push(tree);
      descend(tree, 0);
      continue;
    }
    // Paired: every root candidate sees this same deal.
    dealt.set(f.owner);
    let w = 1;
    if (hist && hScratch) {
      const logw = worldLogWeight(
        f,
        seat,
        hist,
        root.voidMask,
        OPPONENT_MODEL,
        tau,
        cfg.inferenceFloor,
        hScratch,
        LEGAL_BUFS[0],
        featScratch,
        scoreScratch,
        hiddenScratch,
      );
      if (logw > maxLog) {
        const scale = Number.isFinite(maxLog) ? Math.exp(maxLog - logw) : 0;
        for (let k = 0; k < candidates.length; k++) {
          rootW[k] *= scale;
          rootWV[k] *= scale;
        }
        maxLog = logw;
      }
      w = Math.exp(logw - maxLog);
    }
    for (let k = 0; k < candidates.length; k++) {
      if (k > 0) {
        resetFrom(f, root.base);
        f.owner.set(dealt);
      }
      const key = keys.own[candidates[k]];
      let child = tree.children.get(key);
      if (!child) {
        child = createNode(key, seat, n);
        tree.children.set(key, child);
        nodes++;
      }
      child.avail++;
      tree.visits++;
      applyFast(f, candidates[k]);
      path.length = 0;
      path.push(child);
      descend(child, 1);
      rootW[k] += w;
      rootWV[k] += w * lastValue;
    }
  }
  addSearchWork(iterations);

  // Final choice: most visited (paired: best mean), then the other, then the cheaper card.
  let bestCard = candidates[0];
  let bestVisits = -1;
  let bestMean = Number.NEGATIVE_INFINITY;
  const rootStats: Record<string, [number, number]> = {};
  for (let k = 0; k < candidates.length; k++) {
    const card = candidates[k];
    const child = tree.children.get(keys.own[card]);
    const visits = child?.visits ?? 0;
    let mean = child && visits > 0 ? child.value[seat] / visits : Number.NEGATIVE_INFINITY;
    if (inference && rootW[k] > 0) mean = rootWV[k] / rootW[k];
    rootStats[CARD_ID[card]] = [visits, mean];
    // Shōgun's rule: a cheaper card wins unless the dearer one's mean is
    // clearly better (1e-4 VP per strength unit), so near-tie noise never
    // spends a high card.
    const ranked = mean - strengthOf(card, f.trump) * 1e-4;
    const [primary, secondary, bestPrimary, bestSecondary] = cfg.rootPaired
      ? [ranked, visits, bestMean, bestVisits]
      : [visits, ranked, bestVisits, bestMean];
    const better =
      primary > bestPrimary ||
      (primary === bestPrimary &&
        (secondary > bestSecondary ||
          (secondary === bestSecondary &&
            strengthOf(card, f.trump) < strengthOf(bestCard, f.trump))));
    if (better) {
      bestCard = card;
      bestVisits = visits;
      bestMean = ranked;
    }
  }
  return done(candidateAction.get(bestCard) as Action, {
    mode: "tree",
    iterations,
    nodes,
    root: rootStats,
  });
}
