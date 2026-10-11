/**
 * The contract a game implements to take part in the local AI tournament
 * runner (`pnpm --filter @boardgames/core tournament`). Tournaments are run on
 * a developer machine and their results committed as data — nothing here runs
 * on the server.
 */

import type { GameOutcome } from "../machines/outcome";

export interface SimulateInput {
  /** `strategies[seat]` — one AI id per seat, already checked against the manifest. */
  readonly strategies: readonly string[];
  /** Seeds the deal; the same seed with the same strategies replays the same cards. */
  readonly seed: number;
}

/**
 * How the runner pits strategies against each other:
 *   - `head-to-head` — every pair of strategies shares a table, sides swapped
 *     on the same deal (competitive games).
 *   - `benchmark` — each strategy plays every seat on its own, and the file
 *     records how often the table wins (co-op games, where there is no one to
 *     beat but the game).
 */
export type TournamentFormat = "head-to-head" | "benchmark";

/**
 * `Out` is `Promise<GameOutcome>` for AIs that think in another process (an
 * engine); the runner awaits either.
 */
export interface TournamentSimulator<Out extends GameOutcome | Promise<GameOutcome> = GameOutcome> {
  /** Table sizes the runner plays when none are named on the command line. */
  readonly playerCounts: readonly number[];
  /** Default `head-to-head`. */
  readonly format?: TournamentFormat;
  /**
   * Upper bound on parallel workers, for AIs heavy enough that one process per
   * core would exhaust memory (Sushi Go's Nash solver holds ~3 GB).
   */
  readonly maxWorkers?: number;
  /**
   * Which side (0 or 1) each seat plays for on this deal, for games whose
   * teams are not simply the even and odd seats — partner seating (Bughouse's
   * {0,3} v {1,2}), or roles dealt from the seed (The Resistance's spies). In a
   * mirrored pair strategy A takes side 0's seats in one game and side 1's in
   * the other, on the same seed. Absent = `seat % 2`.
   */
  sides?(playerCount: number, seed: number): readonly number[];
  /** Play one all-AI game to the end. Throws (or rejects) if the game cannot finish. */
  simulate(input: SimulateInput): Out;
  /** Release anything the simulator holds (engine processes) before the worker exits. */
  dispose?(): void | Promise<void>;
}

/** A simulator of either kind, as the registry and the worker hold them. */
export type AnyTournamentSimulator = TournamentSimulator<GameOutcome | Promise<GameOutcome>>;

/** The default sides: even seats against odd ones. */
export function alternatingSides(playerCount: number): number[] {
  return Array.from({ length: playerCount }, (_, seat) => seat % 2);
}

/**
 * `strategies[seat]` for game `gameIndex` of a mirrored pair: A holds side 0
 * in even-numbered games and side 1 in odd ones.
 */
export function mirroredSeating(
  sides: readonly number[],
  a: string,
  b: string,
  gameIndex: number,
): string[] {
  const aSide = gameIndex % 2;
  return sides.map((side) => (side === aSide ? a : b));
}
