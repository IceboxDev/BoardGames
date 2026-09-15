// The vote-tally assistant. The Storyteller counts hands clockwise from the
// nominee; the app knows who may raise one, what each hand is worth, and
// which tokens the tally consumes — so a dead player's one ghost vote, the
// Beggar's donated tokens, the Butler's master rule and the Bureaucrat's ×3 /
// Thief's −1 marks are tracked instead of remembered.

import type { CompanionState } from "./companion.ts";
import { playerAt, recordNomination, spendVoteTokens, voudonActive } from "./companion.ts";

export type VoterStatus =
  /** Counts `weight` (1, the Bureaucrat's 3, the Thief's −1). */
  | { kind: "alive"; weight: number }
  /** Dead with their ghost vote still in hand — counts `weight` and spends it. */
  | { kind: "ghost"; weight: number }
  /** The alive Beggar: may vote only with a donated token (spends one). */
  | { kind: "beggar"; weight: number; tokens: number }
  /** The alive Butler: counts only if their master's hand is up too. */
  | { kind: "butler"; weight: number; master: number }
  | { kind: "no-vote"; reason: "dead" | "left" | "voudon" | "no-tokens" };

/** What one raised hand counts for once the marks are applied. */
function weightOf(state: CompanionState, seat: number): number {
  const p = playerAt(state, seat);
  if (p.tripleVote) return 3;
  if (p.negativeVote) return -1;
  return 1;
}

/** Whether `seat` may raise a hand on today's nominations, and what it is worth. */
export function voterStatus(state: CompanionState, seat: number): VoterStatus {
  const p = playerAt(state, seat);
  if (p.left) return { kind: "no-vote", reason: "left" };
  const weight = weightOf(state, seat);
  if (voudonActive(state)) {
    // Only the Voudon and the dead vote; the dead spend nothing.
    if (!p.alive || p.character === "voudon") return { kind: "alive", weight };
    return { kind: "no-vote", reason: "voudon" };
  }
  if (!p.alive) {
    return p.ghostVote ? { kind: "ghost", weight } : { kind: "no-vote", reason: "dead" };
  }
  if (p.character === "beggar") {
    const tokens = p.beggarTokens ?? 0;
    return tokens > 0
      ? { kind: "beggar", weight, tokens }
      : { kind: "no-vote", reason: "no-tokens" };
  }
  if (p.character === "butler" && p.butlerMaster !== undefined) {
    return { kind: "butler", weight, master: p.butlerMaster };
  }
  return { kind: "alive", weight };
}

/**
 * The order hands are counted: clockwise from the player to the nominee's
 * left, all the way round, the nominee last. Players who left town are gone.
 */
export function voteOrder(state: CompanionState, nominee: number): number[] {
  const seats = state.players.filter((p) => !p.left).map((p) => p.seat);
  const at = seats.indexOf(nominee);
  if (at === -1) return seats;
  return [...seats.slice(at + 1), ...seats.slice(0, at + 1)];
}

export type Tally = {
  total: number;
  /** Each raised hand and what it counted for (0 for a hand that doesn't count). */
  hands: Array<{ seat: number; counted: number; status: VoterStatus }>;
};

/** Count the raised hands, applying every status rule. */
export function tallyVotes(state: CompanionState, voters: readonly number[]): Tally {
  const hands = voters.map((seat) => {
    const status = voterStatus(state, seat);
    let counted = 0;
    switch (status.kind) {
      case "alive":
      case "ghost":
      case "beggar":
        counted = status.weight;
        break;
      case "butler":
        counted = voters.includes(status.master) ? status.weight : 0;
        break;
      case "no-vote":
        counted = 0;
    }
    return { seat, counted, status };
  });
  return { total: hands.reduce((sum, h) => sum + h.counted, 0), hands };
}

/**
 * Book a nomination from the raised hands: the tally decides about-to-die /
 * tie / not-enough exactly like a hand-counted number, the consumed tokens
 * are spent, and the hands are kept on the nomination for the record.
 */
export function recordVote(
  state: CompanionState,
  nominator: number,
  nominee: number,
  voters: readonly number[],
): CompanionState {
  const { total } = tallyVotes(state, voters);
  let next = recordNomination(state, nominator, nominee, total);
  const last = next.day.nominations.at(-1);
  if (last) {
    next = {
      ...next,
      day: {
        ...next.day,
        nominations: [...next.day.nominations.slice(0, -1), { ...last, voters: [...voters] }],
      },
    };
  }
  return spendVoteTokens(next, voters);
}
