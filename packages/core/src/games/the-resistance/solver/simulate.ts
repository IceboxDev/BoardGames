/**
 * Cutting a record back to any point in the game, and the bots' spy fail rate.
 * (The game's win chance comes from `lookahead.ts`.)
 */

import type { ResistanceRecord } from "../record";
import { tablePosition } from "../rules";
import type { SolverEvent } from "./posterior";

/** The record as it stood before event `count` (the first `count` events only). */
export function recordUpTo(
  record: ResistanceRecord,
  events: readonly SolverEvent[],
  count: number,
): ResistanceRecord {
  const last = events[count - 1];
  if (!last) return { ...record, rounds: [], roles: record.roles, winner: null, winReason: null };
  const rounds = record.rounds.slice(0, last.round + 1).map((round, r) => {
    if (r < last.round) return round;
    const proposals = round.proposals.slice(0, last.proposalIndex + 1).map((p, i) => {
      if (i < last.proposalIndex || last.kind !== "proposal") return p;
      return { ...p, votes: null };
    });
    return { proposals, result: last.kind === "mission" ? round.result : null };
  });
  const cut = { ...record, rounds, winner: null, winReason: null };
  const pos = tablePosition(cut);
  return { ...cut, winner: pos.winner, winReason: pos.winReason };
}

/**
 * How often a bot spy sabotages when no rule says otherwise — bolder than the
 * Solver's default belief (0.75): spies that hesitate lose, and a bot whose
 * play matched the model exactly would be trivially read by its own teammates.
 */
export const BOT_SPY_FAIL_RATE = 0.9;
