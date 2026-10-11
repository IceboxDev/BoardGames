/**
 * Child process for the tournament runner: plays the games it is sent and
 * reports each outcome. Forked by `cli.ts` with `--import tsx`.
 */

import type { GameOutcome } from "../machines/outcome";
import type { AnyTournamentSimulator } from "./simulator";
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
const simulator: AnyTournamentSimulator = await load();

// Engine processes the simulator holds are released before leaving; a dispose
// that hangs must not keep the worker alive.
let exiting = false;
const exit = async () => {
  if (exiting) return;
  exiting = true;
  setTimeout(() => process.exit(0), 5000).unref();
  try {
    await simulator.dispose?.();
  } catch {
    // Nothing left to report to.
  }
  process.exit(0);
};

// If the runner has gone away there is no one to report to: stop quietly.
const reply = (msg: WorkerReply) => {
  if (!process.connected) {
    void exit();
    return;
  }
  process.send?.(msg, undefined, {}, (err) => {
    if (err) void exit();
  });
};
process.on("disconnect", () => void exit());

// The runner sends the next job only after this one's reply, so games never overlap.
process.on("message", async (job: WorkerJob) => {
  try {
    const outcome = await simulator.simulate({ strategies: job.strategies, seed: job.seed });
    reply({ kind: "done", id: job.id, outcome });
  } catch (err) {
    reply({ kind: "failed", id: job.id, error: err instanceof Error ? err.message : String(err) });
  }
});
reply({ kind: "ready" });
