import { cardStrength, FULL_DECK, isNinja, suitOf } from "./deck";
import { trickWinner } from "./rules";
import type { Action, GameState } from "./types";

export type Mode = "careful" | "aggressive";

const TIERS = [7, 5, 3, 1] as const;

/** Highest reward tier still reachable with `remaining` tricks to play. */
export function reachableTier(tricksWon: number, remaining: number): number {
  for (const tier of TIERS) if (tier <= tricksWon + remaining) return tier;
  return 0;
}

type PlayAction = Extract<Action, { type: "play" }>;

interface Candidate {
  action: PlayAction;
  winsNow: boolean;
  safe: boolean;
  strength: number;
}

/**
 * One-card heuristic: win cheaply when the trick is secure, spend a Ninja only
 * when every remaining trick is needed, otherwise shed the weakest card.
 * Also the rollout policy inside the search.
 */
export function pickPlay(state: GameState, legal: Action[], seat: number, mode: Mode): Action {
  const plays = legal.filter((a): a is PlayAction => a.type === "play");
  if (plays.length === 0) return legal[0];
  if (plays.length === 1) return plays[0];

  const me = state.players[seat];
  const n = state.players.length;
  const trump = state.trumpSuit;
  const remaining = me.hand.length;
  const reachable = reachableTier(me.tricksWon, remaining);
  const chasing = me.tricksWon < reachable;
  const slack = me.tricksWon + remaining - reachable;
  const isLast = state.table.length === n - 1;
  const known = new Set<string>([...me.hand, ...state.played]);
  const unseen = FULL_DECK.filter((c) => !known.has(c));

  const candidates: Candidate[] = plays.map((action) => {
    const card = action.card;
    const lead = state.table.length === 0 ? suitOf(card) : state.leadSuit;
    const trial = [...state.table, { seat, card }];
    const winsNow = trickWinner(trial, trump, lead) === seat;
    const beatable =
      winsNow &&
      !isLast &&
      unseen.some((u) => trickWinner([...trial, { seat: -1, card: u }], trump, lead) === -1);
    return { action, winsNow, safe: winsNow && !beatable, strength: cardStrength(card, trump) };
  });
  const byStrength = (a: Candidate, b: Candidate) => a.strength - b.strength;
  const winning = candidates.filter((c) => c.winsNow).sort(byStrength);
  const safe = candidates.filter((c) => c.safe).sort(byStrength);
  const nonNinja = candidates.filter((c) => !isNinja(c.action.card)).sort(byStrength);
  const dump = (nonNinja[0] ?? [...candidates].sort(byStrength)[0]).action;

  if (mode === "aggressive") {
    return winning.length > 0 ? winning[0].action : dump;
  }

  const safeNonNinja = safe.filter((c) => !isNinja(c.action.card));
  if (safeNonNinja.length > 0) return safeNonNinja[0].action;
  if (safe.length > 0) {
    // Only a Ninja secures this trick: spend it when every remaining trick is
    // needed for the next tier, or on the last trick of the round.
    if ((chasing && slack <= 0) || remaining === 1) return safe[0].action;
  }
  if (isLast && winning.length > 0) return winning[0].action;
  return dump;
}
