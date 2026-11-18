/**
 * Who is at the table, for every Codenames-family game (Codenames, Duet).
 * Rooms tell the machine when a person's connection drops and returns
 * (`SEAT_CONNECTION`); after a short wait anyone still there may hand the
 * empty seat to an AI **stand-in**, and the person takes it back the moment
 * they return — or, when the stand-in is mid-move for them, once that move is
 * done.
 *
 *   away     — seat → since when (a dropped person, stand-in or not)
 *   standIns — seats an AI is playing for an absent person
 *   reclaims — stand-in seats whose person is back, waiting for the AI to
 *              finish its move (applied when the machine next routes)
 *
 * Each game supplies only what is its own: when a stand-in is busy and what
 * else changes when a seat is handed over (`presence.ts` in each game).
 */

/** How long a person is gone before their seat may be handed to the AI. */
export const HANDOVER_AFTER_MS = 45_000;

/** The fields a game's state keeps for presence. `ai[seat]` is null for a person. */
export interface SeatPresence<Tier = unknown> {
  phase: string;
  ai: readonly (Tier | null)[];
  away: readonly { seat: number; since: number }[];
  standIns: readonly number[];
  reclaims: readonly number[];
}

function seated(state: SeatPresence, seat: number): boolean {
  return Number.isInteger(seat) && seat >= 0 && seat < state.ai.length;
}

const aiSeat = (state: SeatPresence, seat: number) => state.ai[seat] != null;

/** A person's connection dropped. AI seats have no connection to lose. */
export function markAway<S extends SeatPresence>(state: S, seat: number, now: number): S {
  if (!seated(state, seat) || state.phase === "over") return state;
  if (aiSeat(state, seat) && !state.standIns.includes(seat)) return state;
  if (state.away.some((a) => a.seat === seat)) return state;
  return {
    ...state,
    away: [...state.away, { seat, since: now }],
    reclaims: state.reclaims.filter((s) => s !== seat),
  };
}

/**
 * The person is back: their seat is theirs again — now, or (when `busy`
 * says the stand-in is mid-move for it) once that move is done.
 */
export function markBack<S extends SeatPresence>(
  state: S,
  seat: number,
  busy: (state: S, seat: number) => boolean,
): S {
  if (!seated(state, seat)) return state;
  const back = { ...state, away: state.away.filter((a) => a.seat !== seat) };
  if (!state.standIns.includes(seat)) return back;
  if (busy(state, seat)) {
    return state.reclaims.includes(seat) ? back : { ...back, reclaims: [...back.reclaims, seat] };
  }
  return reclaimSeat(back, seat);
}

/** Give a stand-in seat back to its person. */
export function reclaimSeat<S extends SeatPresence>(state: S, seat: number): S {
  if (!state.standIns.includes(seat)) return state;
  const ai = state.ai.slice();
  ai[seat] = null;
  return {
    ...state,
    ai: ai as unknown as S["ai"],
    standIns: state.standIns.filter((s) => s !== seat),
    reclaims: state.reclaims.filter((s) => s !== seat),
  };
}

/** Hand back every seat whose person returned while its stand-in was busy. */
export function applyReclaims<S extends SeatPresence>(state: S): S {
  return state.reclaims.reduce((s, seat) => reclaimSeat(s, seat), state);
}

/** The AI level a stand-in plays at: the table's own (a seat AI from the start), else `fallback`. */
export function standInTierOf<Tier>(state: SeatPresence<Tier>, fallback: Tier): Tier {
  const tier = state.ai.find((t, seat) => t != null && !state.standIns.includes(seat));
  return tier ?? fallback;
}

/** When `seat`'s person may first be replaced, or null when they aren't away. */
export function handoverAt(state: SeatPresence, seat: number): number | null {
  const away = state.away.find((a) => a.seat === seat);
  return away ? away.since + HANDOVER_AFTER_MS : null;
}

/** Why `by` can't hand `seat` to the AI at `now`, or null. */
export function handOverProblem(
  state: SeatPresence,
  by: number,
  seat: number,
  now: number,
): string | null {
  if (state.phase === "over") return "the game is over";
  if (!seated(state, by) || aiSeat(state, by)) return "only a person at the table can do that";
  if (!seated(state, seat) || seat === by) return "pick someone else's seat";
  if (state.standIns.includes(seat)) return "the AI is already playing that seat";
  const at = handoverAt(state, seat);
  if (at === null) return "that player is still here";
  if (now < at) return `give them ${Math.ceil((at - now) / 1000)} s more to come back`;
  return null;
}

/** The AI (at `tier`) takes `seat` until its person returns. */
export function seatStandIn<S extends SeatPresence>(state: S, seat: number, tier: unknown): S {
  const ai = state.ai.slice();
  ai[seat] = tier;
  return { ...state, ai: ai as unknown as S["ai"], standIns: [...state.standIns, seat] };
}

/** One seat's presence as a player view shows it. */
export interface SeatPresenceView {
  /** The person's connection dropped (at `awaySince`). */
  awaySince: number | null;
  /** From when anyone else may hand the seat to the AI. */
  handoverAt: number | null;
  /** An AI is playing it for its absent person. */
  standIn: boolean;
  /** The person is back; the stand-in hands over once its move is done. */
  returning: boolean;
}

export function seatPresenceView(
  state: SeatPresence,
  seat: number,
  live: boolean,
): SeatPresenceView {
  const standIn = state.standIns.includes(seat);
  return {
    awaySince: live ? (state.away.find((a) => a.seat === seat)?.since ?? null) : null,
    handoverAt: live && !standIn ? handoverAt(state, seat) : null,
    standIn,
    returning: live && state.reclaims.includes(seat),
  };
}
