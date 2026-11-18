/**
 * Who is at a Duet table — the shared rules are in
 * `../codenames/seat-presence.ts`. Duet is two people by design, so a dropped
 * partner stalls the game: after the wait the one still there may hand the
 * partner's seat to an AI stand-in, which plays it until they return.
 *
 * Duet's own parts: the stand-in is busy while it thinks or touches its
 * picks, and handing over the seat being waited on stops its clock. It plays
 * at the table's AI level, else the default tier.
 */

import { DEFAULT_CODENAMES_MODEL } from "../codenames/ai/models";
import * as shared from "../codenames/seat-presence";
import { guesserOf } from "./rules";
import type { DuetState } from "./types";

export {
  applyReclaims,
  HANDOVER_AFTER_MS,
  handOverProblem,
  markAway,
} from "../codenames/seat-presence";

const guessing = (state: DuetState) => state.phase === "guessing" || state.phase === "sudden-death";

/** The seat the game waits on now: the clue-giver, else the guesser. */
export function waitedOn(state: DuetState): number | null {
  if (state.phase === "clue") return state.giver;
  return guessing(state) ? guesserOf(state) : null;
}

function standInBusy(state: DuetState, seat: number): boolean {
  if (state.aiThinking === seat) return true;
  return guessing(state) && state.aiQueue.length > 0 && guesserOf(state) === seat;
}

/** The person is back: their seat is theirs again — now, or once the stand-in's move is done. */
export function markBack(state: DuetState, seat: number): DuetState {
  return shared.markBack(state, seat, standInBusy);
}

/**
 * The AI takes `seat` until its person returns. A running clock for that seat
 * stops: the stand-in has no timer, and the person gets a fresh one back.
 */
export function handOver(state: DuetState, seat: number): DuetState {
  const next = shared.seatStandIn(
    state,
    seat,
    shared.standInTierOf(state, DEFAULT_CODENAMES_MODEL),
  );
  return waitedOn(next) === seat ? { ...next, deadlineTs: null } : next;
}
