/**
 * Child process for the tournament runner: plays the games it is sent and
 * reports each outcome. Forked by `cli.ts` with `--import tsx`.
 */

import type { GameOutcome } from "../machines/outcome";
import type { TournamentSimulator } from "./simulator";
import { TOURNAMENT_SIMULATORS } from "./simulators";

export interface WorkerJob {
  readonly id: number;
  readonly strategies: readonly string[];
  readonly seed: number;
}

export type WorkerReply =
  | { readonly kind: "ready" }
  | { readonly kind: "done"; readonly id: number; readonly outcome: GameOutcome }
  | { readonly kind: "failed"; readonly id: number; readonly error: string };

const slug = process.argv[2] ?? "";
const load = TOURNAMENT_SIMULATORS[slug];
if (!load) throw new Error(`No tournament simulator for "${slug}"`);
const simulator: TournamentSimulator = await load();

// If the runner has gone away there is no one to report to: stop quietly.
const reply = (msg: WorkerReply) => {
  if (!process.connected) process.exit(0);
  process.send?.(msg, undefined, {}, (err) => {
    if (err) process.exit(0);
  });
};
process.on("disconnect", () => process.exit(0));

process.on("message", (job: WorkerJob) => {
  try {
    const outcome = simulator.simulate({ strategies: job.strategies, seed: job.seed });
    reply({ kind: "done", id: job.id, outcome });
  } catch (err) {
    reply({ kind: "failed", id: job.id, error: err instanceof Error ? err.message : String(err) });
  }
});
reply({ kind: "ready" });
