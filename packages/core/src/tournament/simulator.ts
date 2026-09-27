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

export interface TournamentSimulator {
  /** Table sizes the runner plays when none are named on the command line. */
  readonly playerCounts: readonly number[];
  /**
   * Upper bound on parallel workers, for AIs heavy enough that one process per
   * core would exhaust memory (Sushi Go's Nash solver holds ~3 GB).
   */
  readonly maxWorkers?: number;
  /** Play one all-AI game to the end. Throws if the game cannot finish. */
  simulate(input: SimulateInput): GameOutcome;
}
