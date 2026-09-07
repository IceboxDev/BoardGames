import { createRng, type Rng, shuffle } from "../../lib/rng";
import { canonicalEquals } from "../../machines/action-validation";
import {
  applyLight,
  type EvalWeights,
  evaluate,
  finishRewardsGreedy,
  kindBias,
  lightClone,
  pickBonus,
  pickReward,
} from "./ai-rewards";
import { type Mode, pickPlay } from "./ai-tricks";
import { cardStrength, FULL_DECK, sortHand, suitOf } from "./deck";
import { applyActionTrusted, settleTrick } from "./game-engine";
import { getActivePlayer, getLegalActions, tierFor, trickWinner } from "./rules";
import { RULINGS } from "./rulings";
import type { Action, CardId, GameState, RewardTier, TrickPlay } from "./types";
import { isRewardAction } from "./types";

// ---------------------------------------------------------------------------
// Shōgun: perfect-information Monte Carlo for the cards, one reward of
// lookahead for the map.
//
// Trick play — the other hands are hidden, so sample them ("determinize"):
// deal the unseen cards to the other seats respecting hand sizes and the
// voids they revealed by failing to follow suit, play the round out with the
// Daimyō policy for everyone, and score the resulting trick counts by what
// each seat's reward tier would do to MY standing on the current board. Average
// over samples, play the best card.
//
// Rewards — every candidate is followed by the rest of the phase played
// greedily by the other seats (and my own second Focus pick), then evaluated,
// so a march into a region a 5-trick opponent will strike is seen for what it
// is.
// ---------------------------------------------------------------------------

// Work counter for timing/benchmarks: bumped once per hidden-hand sample and
// once per reward candidate evaluated. `pickAiActionTimed` reads it.
let searchWork = 0;
export function resetSearchStats(): void {
  searchWork = 0;
}
export function takeSearchStats(): { iterations: number } {
  return { iterations: searchWork };
}
/** Other engines (Tenka) report their work through the same counter. */
export function addSearchWork(n: number): void {
  searchWork += n;
}

export interface SearchOptions {
  /** Hidden-hand samples per card decision. */
  determinizations: number;
  /** Wall-clock cap for one decision; 0 = no cap (exactly `determinizations`). */
  timeMs: number;
  /** Reward candidates kept (by one-ply value) for the phase-out lookahead. */
  rewardCandidates: number;
  /** Positional evaluation terms (see `EvalWeights`). */
  weights: EvalWeights;
  /**
   * Score a rollout by simulating the whole rewards phase it leads to (greedy
   * picks in the real order, with the affected-region locks) instead of the
   * additive per-seat tier table. Memoised per trick-count vector per round.
   */
  exactRoundValue: boolean;
  /** In the reward lookahead, let each later seat search this many candidates (0 = greedy). */
  opponentSearch: number;
  /** Policy the other seats follow in trick rollouts. */
  rolloutMode: Mode;
  /**
   * Finish the CURRENT trick by max^n instead of the one-card policy: each
   * later seat picks among this many candidate replies the one that is best
   * for itself (after a rollout). 0 = heuristic replies. Cost grows as
   * k^(players−1) per sample, so keep it at 2–3.
   */
  trickLookahead: number;
}

/**
 * Live defaults. Measured locally (run-tournament.ts, 2-player vs Daimyō):
 * 4 samples → 73 %, 12 → 90 %, 32 → 92 % at roughly 1 / 4 / 10 ms per decision.
 * 24 sits on the flat part of that curve while keeping an AI move well under
 * the server's frame budget.
 */
export const DEFAULT_SEARCH: SearchOptions = {
  determinizations: 24,
  timeMs: 0,
  rewardCandidates: 12,
  weights: { cube: 0, exposure: 0, potential: 0 },
  exactRoundValue: false,
  opponentSearch: 0,
  rolloutMode: "careful",
  trickLookahead: 0,
};

/** Tune the live defaults (the local runner uses this to compare budgets). */
export function configureSearch(patch: Partial<SearchOptions>): SearchOptions {
  Object.assign(DEFAULT_SEARCH, patch);
  return DEFAULT_SEARCH;
}

// ---------------------------------------------------------------------------
// Determinization
// ---------------------------------------------------------------------------

/** `seat:suit` pairs a seat has shown it holds none of (by not following). */
export function voidsOf(state: GameState): Set<string> {
  const voids = new Set<string>();
  const scan = (plays: readonly TrickPlay[]) => {
    if (plays.length === 0) return;
    const lead = suitOf(plays[0].card);
    if (lead === null) return;
    for (const play of plays.slice(1)) {
      const suit = suitOf(play.card);
      if (suit === lead) continue;
      // A Ninja followed while a suit was led: under the follow-suit ruling
      // that also proves a void.
      if (suit === null && !RULINGS.ninjaFollowsSuit) continue;
      voids.add(`${play.seat}:${lead}`);
    }
  };
  for (const trick of state.tricks) scan(trick.plays);
  scan(state.table);
  return voids;
}

/** A copy of the state with every other hand replaced by a consistent random deal. */
export function determinize(state: GameState, me: number, rng: Rng): GameState {
  const next = lightClone(state);
  const known = new Set<CardId>([...next.players[me].hand, ...next.played]);
  const unseen = FULL_DECK.filter((c) => !known.has(c));
  const voids = voidsOf(state);
  const isVoid = (seat: number, card: CardId) => {
    const suit = suitOf(card);
    return suit !== null && voids.has(`${seat}:${suit}`);
  };
  const voidCount = (seat: number) => [...voids].filter((v) => v.startsWith(`${seat}:`)).length;
  const others = next.players
    .filter((p) => p.index !== me)
    .sort((a, b) => voidCount(b.index) - voidCount(a.index));

  for (let attempt = 0; attempt < 12; attempt++) {
    let pool = shuffle(unseen, rng);
    const assigned = new Map<number, CardId[]>();
    let ok = true;
    for (const p of others) {
      const allowed = pool.filter((c) => !isVoid(p.index, c));
      if (allowed.length < p.hand.length) {
        ok = false;
        break;
      }
      const take = allowed.slice(0, p.hand.length);
      assigned.set(p.index, take);
      const taken = new Set(take);
      pool = pool.filter((c) => !taken.has(c));
    }
    if (ok) {
      for (const p of others) p.hand = sortHand(assigned.get(p.index) ?? [], next.trumpSuit);
      return next;
    }
  }
  // Contradictory voids (should not happen): fall back to an unconstrained deal.
  let pool = shuffle(unseen, rng);
  for (const p of others) {
    p.hand = sortHand(pool.slice(0, p.hand.length), next.trumpSuit);
    pool = pool.slice(p.hand.length);
  }
  return next;
}

// ---------------------------------------------------------------------------
// Rollouts and the tier table
// ---------------------------------------------------------------------------

/** Play the rest of the round with the one-card policy for every seat. Mutates. */
export function rolloutRound(state: GameState, me = -1, othersMode: Mode = "careful"): void {
  for (let guard = 0; guard < 200; guard++) {
    if (state.phase === "trick-settle") {
      settleTrick(state);
      continue;
    }
    if (state.phase !== "trick") return;
    const seat = state.turn;
    const legal = getLegalActions(state);
    if (legal.length === 0) return;
    applyActionTrusted(state, pickPlay(state, legal, seat, seat === me ? "careful" : othersMode));
  }
}

// ---------------------------------------------------------------------------
// Exact round value: the rewards phase a trick outcome leads to, played out
// greedily in the real order with the locks. Memoised per trick-count vector
// because most rollouts end in one of a handful of outcomes.
// ---------------------------------------------------------------------------

let roundCache: { key: string; base: number; values: Map<string, number> } | null = null;

function exactRoundValue(sim: GameState, me: number, w: EvalWeights, boardKey: string): number {
  const key = `${sim.seed}/${sim.round}/${me}/${boardKey}/${w.cube},${w.exposure},${w.potential}`;
  if (roundCache?.key !== key) roundCache = { key, base: Number.NaN, values: new Map() };
  const tricks = sim.players.map((p) => p.tricksWon).join(",");
  const hit = roundCache.values.get(tricks);
  if (hit !== undefined) return hit;
  finishRewardsGreedy(sim);
  const value = evaluate(sim, me, w);
  roundCache.values.set(tricks, value);
  return value;
}

function boardKeyOf(state: GameState): string {
  return `${state.board.map((s) => s.map((c) => c?.[0] ?? ".").join("")).join("|")}#${Object.values(state.supply).join(",")}`;
}

const TIER_INDEX: Record<number, number> = { 0: 0, 1: 1, 3: 2, 5: 3, 7: 4 };

function tierIndex(tricks: number): number {
  return TIER_INDEX[tierFor(tricks) ?? 0] ?? 0;
}

/**
 * `table[seat][tier]` = how my standing (score − best opponent) changes when
 * `seat` spends a reward of that tier greedily on the CURRENT board. Cached:
 * the board does not change during a round's tricks.
 */
const tierCache = new Map<string, number[][]>();
const TIER_CACHE_MAX = 16;

export function tierTable(
  state: GameState,
  me: number,
  w: EvalWeights = DEFAULT_SEARCH.weights,
): number[][] {
  const key = [
    state.seed,
    state.round,
    me,
    state.board.map((s) => s.map((c) => c?.[0] ?? ".").join("")).join("|"),
    Object.values(state.supply).join(","),
    w.cube,
    w.exposure,
    w.potential,
  ].join("/");
  const cached = tierCache.get(key);
  if (cached) return cached;

  const base = evaluate(state, me, w);
  const table = state.players.map((p) => {
    const row = [0];
    for (const tier of [1, 3, 5, 7] as RewardTier[]) {
      const sim = lightClone(state);
      sim.phase = "rewards";
      sim.affected = [];
      sim.bonusQueue = [];
      sim.rewardQueue = [{ player: p.index, tier, picksLeft: tier === 7 ? 2 : 1, used: [] }];
      for (let picks = 0; picks < 2 && sim.phase === "rewards"; picks++) {
        const legal = getLegalActions(sim);
        if (legal.length === 0) break;
        applyActionTrusted(sim, pickReward(sim, legal, p.index, "careful"));
      }
      row.push(evaluate(sim, me, w) - base);
    }
    return row;
  });
  if (tierCache.size >= TIER_CACHE_MAX) {
    const oldest = tierCache.keys().next().value;
    if (oldest !== undefined) tierCache.delete(oldest);
  }
  tierCache.set(key, table);
  return table;
}

function roundValue(state: GameState, table: number[][], me: number): number {
  let value = 0;
  for (const p of state.players) value += table[p.index][tierIndex(p.tricksWon)];
  // Tie-break: prefer keeping strength in hand is handled by the caller.
  return value + (state.players[me].tricksWon - 0) * 0.001;
}

type PlayAction = Extract<Action, { type: "play" }>;

/** A seat's plausible replies: its heuristic pick, its cheapest and strongest winners, its lowest card. */
function candidateReplies(state: GameState, seat: number, k: number): PlayAction[] {
  const legal = getLegalActions(state);
  const plays = legal.filter((a): a is PlayAction => a.type === "play");
  if (plays.length <= k) return plays;
  const trump = state.trumpSuit;
  const strength = (p: PlayAction) => cardStrength(p.card, trump);
  const picks: PlayAction[] = [];
  const add = (a: PlayAction | undefined) => {
    if (a && picks.length < k && !picks.some((p) => canonicalEquals(p, a))) picks.push(a);
  };
  const heuristic = pickPlay(state, legal, seat, "careful");
  add(heuristic.type === "play" ? heuristic : undefined);
  const winners = plays
    .filter((p) => {
      const lead = state.table.length === 0 ? suitOf(p.card) : state.leadSuit;
      return trickWinner([...state.table, { seat, card: p.card }], trump, lead) === seat;
    })
    .sort((a, b) => strength(a) - strength(b));
  add(winners[0]);
  add([...plays].sort((a, b) => strength(a) - strength(b))[0]);
  add(winners[winners.length - 1]);
  return picks;
}

/**
 * Finish the current trick by max^n over pruned replies, then roll the rest of
 * the round out. Returns the terminal state of the chosen line. Every later
 * seat picks the reply whose terminal outcome is best for ITSELF, judged by
 * its own tier table on the root board.
 */
function finishTrickMaxN(
  sim: GameState,
  root: GameState,
  me: number,
  opts: SearchOptions,
): GameState {
  if (sim.phase === "trick-settle") settleTrick(sim);
  if (sim.phase !== "trick" || sim.table.length === 0) {
    rolloutRound(sim, me, opts.rolloutMode);
    return sim;
  }
  const seat = sim.turn;
  const candidates = candidateReplies(sim, seat, opts.trickLookahead);
  if (candidates.length <= 1) {
    if (candidates[0]) applyActionTrusted(sim, candidates[0]);
    return finishTrickMaxN(sim, root, me, opts);
  }
  const table = tierTable(root, seat, opts.weights);
  let best: { terminal: GameState; value: number } | null = null;
  for (const candidate of candidates) {
    const next = lightClone(sim);
    applyActionTrusted(next, candidate);
    const terminal = finishTrickMaxN(next, root, me, opts);
    const value = roundValue(terminal, table, seat);
    if (best === null || value > best.value) best = { terminal, value };
  }
  return best ? best.terminal : sim;
}

function decisionRng(state: GameState, salt: number): Rng {
  const point =
    state.round * 10_000 + state.trickNumber * 100 + state.table.length * 10 + state.played.length;
  return createRng((state.seed ^ Math.imul(point + salt, 0x9e3779b1)) | 0);
}

// ---------------------------------------------------------------------------
// Decisions
// ---------------------------------------------------------------------------

export function pickPlaySearch(
  state: GameState,
  legal: Action[],
  seat: number,
  options: Partial<SearchOptions> = {},
): Action {
  const opts: SearchOptions = { ...DEFAULT_SEARCH, ...options };
  const plays = legal.filter((a): a is Extract<Action, { type: "play" }> => a.type === "play");
  if (plays.length === 0) return legal[0];
  if (plays.length === 1) return plays[0];

  const table = opts.exactRoundValue ? null : tierTable(state, seat, opts.weights);
  const boardKey = opts.exactRoundValue ? boardKeyOf(state) : "";
  const rng = decisionRng(state, 7);
  const totals = new Map<CardId, number>();
  const deadline = opts.timeMs > 0 ? performance.now() + opts.timeMs : Number.POSITIVE_INFINITY;
  for (let d = 0; d < opts.determinizations; d++) {
    if (d > 0 && performance.now() > deadline) break;
    searchWork++;
    const det = determinize(state, seat, rng);
    for (const play of plays) {
      let sim = lightClone(det);
      applyActionTrusted(sim, play);
      if (opts.trickLookahead > 0) sim = finishTrickMaxN(sim, state, seat, opts);
      else rolloutRound(sim, seat, opts.rolloutMode);
      const value = table
        ? roundValue(sim, table, seat)
        : exactRoundValue(sim, seat, opts.weights, boardKey);
      totals.set(play.card, (totals.get(play.card) ?? 0) + value);
    }
  }
  let best = plays[0];
  let bestValue = Number.NEGATIVE_INFINITY;
  for (const play of plays) {
    // Cheaper cards win ties so strength stays in hand for later tricks.
    const value = (totals.get(play.card) ?? 0) - cardStrength(play.card, state.trumpSuit) * 1e-4;
    if (value > bestValue) {
      bestValue = value;
      best = play;
    }
  }
  return best;
}

export function pickRewardSearch(
  state: GameState,
  legal: Action[],
  seat: number,
  options: Partial<SearchOptions> = {},
): Action {
  const opts: SearchOptions = { ...DEFAULT_SEARCH, ...options };
  const pass = legal.find((a) => a.type === "pass");
  const candidates = legal.filter(isRewardAction);
  if (candidates.length === 0) return pass ?? legal[0];

  const w = opts.weights;
  const base = evaluate(state, seat, w);
  const ranked = candidates
    .map((action) => ({
      action,
      value:
        evaluate(applyLight(state, action), seat, w) -
        base +
        kindBias(action) -
        action.region * 1e-4,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, opts.rewardCandidates);

  const finish = (sim: GameState) =>
    opts.opponentSearch > 0 ? finishRewardsSearch(sim, opts) : finishRewardsGreedy(sim);

  let best: { action: Action; value: number } | null = null;
  for (const { action } of ranked) {
    searchWork++;
    const sim = applyLight(state, action);
    finish(sim);
    const value = evaluate(sim, seat, w) - base + kindBias(action) * 0.1;
    if (best === null || value > best.value) best = { action, value };
  }
  if (pass) {
    const sim = applyLight(state, pass);
    finish(sim);
    const value = evaluate(sim, seat, w) - base;
    if (best === null || value > best.value + 1e-9) return pass;
  }
  return best?.action ?? pass ?? legal[0];
}

/**
 * Play out the rest of the rewards phase with every later seat doing its own
 * (shallower) lookahead — a stronger model of the table than pure greed.
 * The nested searches finish greedily, so the recursion is exactly one level.
 */
export function finishRewardsSearch(state: GameState, opts: SearchOptions): void {
  const nested: Partial<SearchOptions> = {
    rewardCandidates: opts.opponentSearch,
    opponentSearch: 0,
    weights: opts.weights,
  };
  for (let guard = 0; guard < 40; guard++) {
    if (state.phase !== "rewards" && state.phase !== "bonus") return;
    const seat = getActivePlayer(state);
    const legal = getLegalActions(state);
    if (legal.length === 0) return;
    const action =
      state.phase === "rewards"
        ? pickRewardSearch(state, legal, seat, nested)
        : pickBonus(state, legal, seat);
    applyActionTrusted(state, action);
  }
}
