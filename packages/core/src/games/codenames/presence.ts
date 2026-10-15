/**
 * Who is at the table. Rooms tell the machine when a person's connection
 * drops and returns (`SEAT_CONNECTION`); a Codenames table can't play on
 * around a missing spymaster or a team's only guesser, so after a short wait
 * anyone still there may hand the empty seat to an AI **stand-in**. The
 * person takes it back the moment they return — or, if the stand-in is in
 * the middle of a move for them, as soon as that move is done.
 *
 *   away     — seat → since when (a dropped person, stand-in or not)
 *   standIns — seats an AI is playing for an absent person
 *   reclaims — stand-in seats whose person is back, waiting for the AI to
 *              finish its move (applied when the machine next routes)
 *
 * The stand-in plays at the table's own AI level (the first AI seat's tier),
 * or the default tier at an all-human table.
 */

import { DEFAULT_CODENAMES_MODEL } from "./ai/models";
import { guessersOf, isAiSeat } from "./rules";
import type { CodenamesState } from "./types";

/** How long a person is gone before their seat may be handed to the AI. */
export const HANDOVER_AFTER_MS = 45_000;

function seated(state: CodenamesState, seat: number): boolean {
  return Number.isInteger(seat) && seat >= 0 && seat < state.seatCount;
}

/** A person's connection dropped. AI seats have no connection to lose. */
export function markAway(state: CodenamesState, seat: number, now: number): CodenamesState {
  if (!seated(state, seat) || state.phase === "over") return state;
  if (isAiSeat(state, seat) && !state.standIns.includes(seat)) return state;
  if (state.away.some((a) => a.seat === seat)) return state;
  return {
    ...state,
    away: [...state.away, { seat, since: now }],
    reclaims: state.reclaims.filter((s) => s !== seat),
  };
}

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
  if (!seated(state, seat)) return state;
  const back = { ...state, away: state.away.filter((a) => a.seat !== seat) };
  if (!state.standIns.includes(seat)) return back;
  if (standInBusy(state, seat)) {
    return state.reclaims.includes(seat) ? back : { ...back, reclaims: [...back.reclaims, seat] };
  }
  return reclaimSeat(back, seat);
}

/** Give a stand-in seat back to its person. */
export function reclaimSeat(state: CodenamesState, seat: number): CodenamesState {
  if (!state.standIns.includes(seat)) return state;
  const ai = state.ai.slice();
  ai[seat] = null;
  return {
    ...state,
    ai,
    standIns: state.standIns.filter((s) => s !== seat),
    reclaims: state.reclaims.filter((s) => s !== seat),
  };
}

/** Hand back every seat whose person returned while its stand-in was busy. */
export function applyReclaims(state: CodenamesState): CodenamesState {
  return state.reclaims.reduce((s, seat) => reclaimSeat(s, seat), state);
}

/** The AI level a stand-in plays at: the table's own, else the default. */
export function standInTier(state: CodenamesState): NonNullable<CodenamesState["ai"][number]> {
  const tier = state.ai.find((t, seat) => t !== null && !state.standIns.includes(seat));
  return tier ?? DEFAULT_CODENAMES_MODEL;
}

/** When `seat`'s person may first be replaced, or null when they aren't away. */
export function handoverAt(state: CodenamesState, seat: number): number | null {
  const away = state.away.find((a) => a.seat === seat);
  return away ? away.since + HANDOVER_AFTER_MS : null;
}

/** Why `by` can't hand `seat` to the AI at `now`, or null. */
export function handOverProblem(
  state: CodenamesState,
  by: number,
  seat: number,
  now: number,
): string | null {
  if (state.phase === "over") return "the game is over";
  if (!seated(state, by) || isAiSeat(state, by)) return "only a person at the table can do that";
  if (!seated(state, seat) || seat === by) return "pick someone else's seat";
  if (state.standIns.includes(seat)) return "the AI is already playing that seat";
  const at = handoverAt(state, seat);
  if (at === null) return "that player is still here";
  if (now < at) return `give them ${Math.ceil((at - now) / 1000)} s more to come back`;
  return null;
}

/**
 * The AI takes `seat` until its person returns. A running clock for that seat
 * stops: the stand-in has no timer, and the person gets a fresh one back.
 */
export function handOver(state: CodenamesState, seat: number): CodenamesState {
  const ai = state.ai.slice();
  ai[seat] = standInTier(state);
  const next = { ...state, ai, standIns: [...state.standIns, seat] };
  const clueGiver = next.phase === "clue" && next.appeal === null && seat === next.currentTeam;
  const nowGuessing =
    next.phase === "guessing" && guessersOf(next, next.currentTeam).every((s) => isAiSeat(next, s));
  return clueGiver || nowGuessing ? { ...next, deadlineTs: null } : next;
}
