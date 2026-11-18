/**
 * Who is at a Codenames table — the shared rules are in `seat-presence.ts`;
 * this file holds what is Codenames' own: a table can't play on around a
 * missing spymaster or a team's only guesser, the stand-in is busy while it
 * thinks, touches its picks or rules as that seat, and handing over the seat
 * being waited on stops its clock.
 *
 * The stand-in plays at the table's own AI level (the first AI seat's tier),
 * or the default tier at an all-human table.
 */

import { DEFAULT_CODENAMES_MODEL } from "./ai/models";
import { guessersOf, isAiSeat } from "./rules";
import * as shared from "./seat-presence";
import type { CodenamesState } from "./types";

export {
  applyReclaims,
  HANDOVER_AFTER_MS,
  handOverProblem,
  handoverAt,
  markAway,
  reclaimSeat,
} from "./seat-presence";

/**
 * Whether the stand-in at `seat` is in the middle of something — thinking for
 * it, touching its picks, or ruling as it — so handing the seat back now
 * would cut a move in half.
 */
function standInBusy(state: CodenamesState, seat: number): boolean {
  if (state.aiThinking === seat) return true;
  return (
    state.phase === "guessing" &&
    state.aiQueue.length > 0 &&
    guessersOf(state, state.currentTeam)[0] === seat
  );
}

/** The person is back: their seat is theirs again — now, or once the stand-in's move is done. */
export function markBack(state: CodenamesState, seat: number): CodenamesState {
  return shared.markBack(state, seat, standInBusy);
}

/** The AI level a stand-in plays at: the table's own, else the default. */
export function standInTier(state: CodenamesState): NonNullable<CodenamesState["ai"][number]> {
  return shared.standInTierOf(state, DEFAULT_CODENAMES_MODEL);
}

/**
 * The AI takes `seat` until its person returns. A running clock for that seat
 * stops: the stand-in has no timer, and the person gets a fresh one back.
 */
export function handOver(state: CodenamesState, seat: number): CodenamesState {
  const next = shared.seatStandIn(state, seat, standInTier(state));
  const clueGiver = next.phase === "clue" && next.appeal === null && seat === next.currentTeam;
  const nowGuessing =
    next.phase === "guessing" && guessersOf(next, next.currentTeam).every((s) => isAiSeat(next, s));
  return clueGiver || nowGuessing ? { ...next, deadlineTs: null } : next;
}
