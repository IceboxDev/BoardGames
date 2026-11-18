/**
 * When an operative should stop guessing — decided by the race, not a fixed
 * confidence floor. A touch is worth taking when it raises the team's chance
 * of winning over ending the turn now:
 *
 *   touch  ⇔  p·W(own) + (1−p)·[share_bys·W(stop) + share_opp·W(opp) + share_ass·0]  >  W(stop)
 *
 * p is the guesser's probability that the word is ours; what a wrong card
 * costs depends on what is still face down (an assassin among 6 others is not
 * one among 16) and on the race: far ahead, the assassin throws away a won
 * game; with the other team one agent from winning, stopping loses as surely
 * as the assassin does, so every plausible word is worth a touch.
 *
 * A listed word's odds come from its stated probability through a measured
 * table (`MEASURED_ODDS`) — the guesser's numbers are not frequencies.
 *
 * W is a small race model — each turn a team finds k of its agents, k drawn
 * around that team's own rate (its agents found per clue so far, shrunk to a
 * prior), and the first side to need nothing wins. Pure; shared by the server
 * agent and the bench.
 */
import type { GuessInput } from "./agent";

/** Agents a team finds per clue before it has shown its own rate. */
export const PRIOR_RATE = 1.8;
/** How many clues' worth of weight the prior keeps. */
const PRIOR_WEIGHT = 2;
/** Per-turn chance that a team's turn ends the game on its assassin. */
const ASSASSIN_PER_TURN = 0.02;
const MAX_K = 9;

/** P(a team finds k agents this turn), Poisson around `rate`. */
function turnDistribution(rate: number): number[] {
  const out: number[] = [];
  let p = Math.exp(-rate);
  for (let k = 0; k <= MAX_K; k++) {
    out.push(p);
    p = (p * rate) / (k + 1);
  }
  const total = out.reduce((s, x) => s + x, 0);
  return out.map((x) => x / total);
}

export interface RaceRates {
  /** Our agents found per clue. */
  us: number;
  /** Theirs. */
  them: number;
}

export interface RaceTable {
  /** Our win chance needing `a` v their `b`, on THEIR move (our turn just ended). */
  theirMove: (a: number, b: number) => number;
  /** The same on OUR move. */
  ourMove: (a: number, b: number) => number;
}

const SIZE = 9;

/** The race model's win chances for every (our need, their need). */
export function raceTable(rates: RaceRates): RaceTable {
  const pu = turnDistribution(rates.us);
  const pt = turnDistribution(rates.them);
  const at = (a: number, b: number) => a * (SIZE + 1) + b;
  const ours = new Float64Array((SIZE + 1) ** 2);
  const theirs = new Float64Array((SIZE + 1) ** 2);
  const keep = 1 - ASSASSIN_PER_TURN;
  for (let a = 0; a <= SIZE; a++) {
    for (let b = 0; b <= SIZE; b++) {
      if (a === 0) {
        ours[at(a, b)] = 1;
        theirs[at(a, b)] = 1;
        continue;
      }
      if (b === 0) continue;
      // V = keep·[Σ_{k≥1} pu_k·(k≥a ? 1 : W(a−k,b)) + pu_0·W(a,b)]
      // W = keep·[Σ_{k≥1} pt_k·(k≥b ? 0 : V(a,b−k)) + pt_0·V(a,b)] + α (their assassin)
      let vRest = 0;
      let wRest = 0;
      for (let k = 1; k <= MAX_K; k++) {
        vRest += (pu[k] ?? 0) * (k >= a ? 1 : (theirs[at(a - k, b)] ?? 0));
        wRest += (pt[k] ?? 0) * (k >= b ? 0 : (ours[at(a, b - k)] ?? 0));
      }
      const v0 = keep * (pu[0] ?? 0);
      const w0 = keep * (pt[0] ?? 0);
      const vConst = keep * vRest;
      const wConst = keep * wRest + ASSASSIN_PER_TURN;
      const v = (vConst + v0 * wConst) / (1 - v0 * w0);
      ours[at(a, b)] = v;
      theirs[at(a, b)] = wConst + w0 * v;
    }
  }
  const read = (t: Float64Array) => (a: number, b: number) =>
    a <= 0 ? 1 : b <= 0 ? 0 : (t[at(Math.min(a, SIZE), Math.min(b, SIZE))] ?? 0);
  return { theirMove: read(theirs), ourMove: read(ours) };
}

/** A team's agents per clue from the public record, shrunk to the prior. */
export function observedRate(history: GuessInput["history"], side: "us" | "them"): number {
  const mine = side === "us" ? "own" : "opponent";
  let clues = 0;
  let found = 0;
  for (const turn of history) {
    if (turn.by !== side || !turn.clue) continue;
    clues++;
    found += turn.guesses.filter((g) => g.result === mine).length;
  }
  return (found + PRIOR_RATE * PRIOR_WEIGHT) / (clues + PRIOR_WEIGHT);
}

export interface StopState {
  /** Our agents still face down. */
  need: number;
  /** Theirs. */
  opponentNeed: number;
  /** Every face-down card. */
  faceDown: number;
  /** 1 while the assassin is face down. */
  assassins: number;
}

/** What a listed word turns out to be. */
export interface PickOdds {
  own: number;
  bystander: number;
  opponent: number;
  assassin: number;
}

/** Stated-probability bands, low edge first, and what words in each band turned out to be. */
export type OddsTable = { from: number; odds: PickOdds }[];

/** Odds for words within the clue's number, and for words past it (the extra guess spent on this clue). */
export interface PickOddsTables {
  within: OddsTable;
  beyond: OddsTable;
}

/**
 * Measured on the stop bench (`codenames-stop-bench.ts`, run s2: the
 * Mastermind's operative, 104 positions, 2nd+ listed words). The stated
 * probability is not a frequency — 0.55 and up was ours nearly every time —
 * and where the word sits matters more: within the clue's number even a
 * 0.3–0.45 word was ours half the time and rarely theirs or the assassin;
 * past the number (one more for this clue) words were ours 15–25 %, theirs
 * a quarter to a third, the assassin up to one in ten. Bands with no
 * measurements borrow their neighbour's.
 */
export const MEASURED_ODDS: PickOddsTables = {
  within: [
    { from: 0, odds: { own: 0.15, bystander: 0.56, opponent: 0.23, assassin: 0.06 } },
    { from: 0.25, odds: { own: 0.51, bystander: 0.29, opponent: 0.11, assassin: 0.09 } },
    { from: 0.35, odds: { own: 0.54, bystander: 0.43, opponent: 0.01, assassin: 0.02 } },
    { from: 0.45, odds: { own: 0.78, bystander: 0.2, opponent: 0.02, assassin: 0 } },
    { from: 0.55, odds: { own: 0.95, bystander: 0.04, opponent: 0, assassin: 0 } },
  ],
  beyond: [
    { from: 0, odds: { own: 0.15, bystander: 0.56, opponent: 0.23, assassin: 0.06 } },
    { from: 0.25, odds: { own: 0.25, bystander: 0.33, opponent: 0.32, assassin: 0.1 } },
    { from: 0.35, odds: { own: 0.43, bystander: 0.35, opponent: 0.1, assassin: 0.13 } },
    { from: 0.45, odds: { own: 0.54, bystander: 0.43, opponent: 0.01, assassin: 0.02 } },
    { from: 0.55, odds: { own: 0.78, bystander: 0.2, opponent: 0.02, assassin: 0 } },
  ],
};

/** A stated probability's measured odds, within the clue's number or past it. */
export function oddsOf(
  p: number,
  beyond = false,
  tables: PickOddsTables = MEASURED_ODDS,
): PickOdds {
  const table = beyond ? tables.beyond : tables.within;
  let out = table[0]?.odds ?? { own: p, bystander: 1 - p, opponent: 0, assassin: 0 };
  for (const band of table) if (p >= band.from) out = band.odds;
  return out;
}

/** Whether the i-th listed word (0-based) is past what the clue's number covers. */
export function beyondNumber(i: number, count: number | "unlimited"): boolean {
  return count !== "unlimited" && i >= count;
}

/**
 * Each listed word's odds. Words named for an earlier clue (owed words) are
 * read as within a number; for the current clue, the count past its number
 * decides — so an owed word ahead of it doesn't push this clue's words "past".
 */
export function oddsOfListed(
  listed: readonly { confidence: number; earlier?: boolean }[],
  count: number | "unlimited",
  tables: PickOddsTables = MEASURED_ODDS,
): PickOdds[] {
  let forThis = 0;
  return listed.map((l) => {
    if (l.earlier) return oddsOf(l.confidence, false, tables);
    return oddsOf(l.confidence, beyondNumber(forThis++, count), tables);
  });
}

/**
 * How many of the listed words (in touch order, each with its odds) to take
 * — optimal stopping over the list: a touch is worth own · (what the rest of
 * the list wins after it) + bystander · (the turn ends) + opponent · (the turn
 * ends with their agent shown) + assassin · 0, against ending the turn now.
 * The first is always taken (a turn needs a guess). Assumes, as play does,
 * that each earlier pick was ours.
 */
export function picksToTake(odds: readonly PickOdds[], state: StopState, table: RaceTable): number {
  const { opponentNeed } = state;
  const n = Math.min(odds.length, state.need);
  const stopAt = (i: number) => table.theirMove(state.need - i, opponentNeed);
  // value[i]: best from just before pick i (picks 0..i−1 were ours).
  const value: number[] = Array(n + 1).fill(0);
  const touch: number[] = Array(n).fill(0);
  value[n] = n >= state.need ? 1 : stopAt(n);
  for (let i = n - 1; i >= 0; i--) {
    const o = odds[i] ?? { own: 0, bystander: 1, opponent: 0, assassin: 0 };
    const need = state.need - i;
    const opp = opponentNeed > 0 ? o.opponent : 0;
    const ass = state.assassins > 0 ? o.assassin : 0;
    const total = o.own + o.bystander + opp + ass || 1;
    touch[i] =
      (o.own * (value[i + 1] ?? 0) +
        o.bystander * stopAt(i) +
        opp * table.theirMove(need, opponentNeed - 1)) /
      total;
    value[i] = Math.max(stopAt(i), touch[i] ?? 0);
  }
  let taken = n > 0 ? 1 : 0;
  while (taken < n && (touch[taken] ?? 0) > stopAt(taken)) taken++;
  return taken;
}

/** The race as an operative's input shows it (classic only; null for Duet). */
export function stopStateOf(input: GuessInput): { state: StopState; table: RaceTable } | null {
  if (input.mode !== "classic" || input.opponentAgentsLeft === undefined) return null;
  return {
    state: {
      need: input.agentsLeft,
      opponentNeed: input.opponentAgentsLeft,
      faceDown: input.words.length,
      assassins: 1,
    },
    table: raceTable({
      us: observedRate(input.history, "us"),
      them: observedRate(input.history, "them"),
    }),
  };
}

// ---------------------------------------------------------------------------
// Duet: a race against the timer
// ---------------------------------------------------------------------------

/** Agents a Duet pair finds per turn before it has shown its own rate. */
export const DUET_PRIOR_RATE = 2;
/** Sudden death: each agent still hidden must be found with no miss — this often per agent. */
const SUDDEN_DEATH_HIT = 0.5;
/** Per-turn chance a Duet guesser hits an assassin. */
const DUET_ASSASSIN_PER_TURN = 0.03;
const DUET_AGENTS = 15;
const DUET_TOKENS = 11;

/** W(a, t): the pair's chance to win with `a` distinct agents hidden and `t` tokens left, a turn about to start. */
export function duetTable(rate: number): (agents: number, tokens: number) => number {
  const pk = turnDistribution(rate);
  const at = (a: number, t: number) => a * (DUET_TOKENS + 1) + t;
  const w = new Float64Array((DUET_AGENTS + 1) * (DUET_TOKENS + 1));
  for (let a = 0; a <= DUET_AGENTS; a++) {
    for (let t = 0; t <= DUET_TOKENS; t++) {
      if (a === 0) w[at(a, t)] = 1;
      else if (t === 0) w[at(a, t)] = SUDDEN_DEATH_HIT ** a;
      else {
        let v = 0;
        for (let k = 0; k <= MAX_K; k++)
          v += (pk[k] ?? 0) * (k >= a ? 1 : (w[at(a - k, t - 1)] ?? 0));
        w[at(a, t)] = (1 - DUET_ASSASSIN_PER_TURN) * v;
      }
    }
  }
  return (a, t) =>
    a <= 0 ? 1 : (w[at(Math.min(a, DUET_AGENTS), Math.max(0, Math.min(t, DUET_TOKENS)))] ?? 0);
}

export interface DuetStopState {
  /** Agents left on the clue-giver's side — the most this turn can find. */
  sideLeft: number;
  /** Distinct agents hidden across both sides. */
  totalLeft: number;
  /** Tokens left before this turn spends its own. */
  tokens: number;
}

/**
 * Duet's stop: every turn spends a token however it ends, so a bystander
 * costs what stopping does — only the assassin is a real risk, and the
 * shorter the timer, the more each agent found now is worth.
 */
export function duetPicksToTake(
  odds: readonly PickOdds[],
  state: DuetStopState,
  table: (agents: number, tokens: number) => number,
): number {
  const n = Math.min(odds.length, state.sideLeft);
  const stopAt = (i: number) => table(state.totalLeft - i, state.tokens - 1);
  const value: number[] = Array(n + 1).fill(0);
  const touch: number[] = Array(n).fill(0);
  value[n] = state.totalLeft - n <= 0 ? 1 : stopAt(n);
  for (let i = n - 1; i >= 0; i--) {
    const o = odds[i] ?? { own: 0, bystander: 1, opponent: 0, assassin: 0 };
    const miss = o.bystander + o.opponent;
    const total = o.own + miss + o.assassin || 1;
    const next = state.totalLeft - i - 1 <= 0 ? 1 : (value[i + 1] ?? 0);
    touch[i] = (o.own * next + miss * stopAt(i)) / total;
    value[i] = Math.max(stopAt(i), touch[i] ?? 0);
  }
  let taken = n > 0 ? 1 : 0;
  while (taken < n && (touch[taken] ?? 0) > stopAt(taken)) taken++;
  return taken;
}

/** How many of a scored guesser's listed words to take, by the game's race (classic or Duet). */
export function scoredTake(input: GuessInput, odds: readonly PickOdds[]): number {
  const classic = stopStateOf(input);
  if (classic) return picksToTake(odds, classic.state, classic.table);
  if (input.mode === "duet" && input.turnsLeft !== undefined && input.turnsLeft > 0) {
    let clues = 0;
    let found = 0;
    for (const turn of input.history) {
      if (!turn.clue) continue;
      clues++;
      found += turn.guesses.filter((g) => g.result === "own").length;
    }
    const rate = (found + DUET_PRIOR_RATE * PRIOR_WEIGHT) / (clues + PRIOR_WEIGHT);
    return duetPicksToTake(
      odds,
      {
        sideLeft: input.agentsLeft,
        totalLeft: input.totalAgentsLeft ?? input.agentsLeft,
        tokens: input.turnsLeft,
      },
      duetTable(rate),
    );
  }
  return odds.length;
}
