import type { GameOutcome } from "../../machines/outcome";
import { playMachineToEnd } from "../../tournament/drive-machine";
import type { TournamentSimulator } from "../../tournament/simulator";
import { skyTeamMachine, skyTeamSpec } from "./machine";
import { skyTeamManifest } from "./manifest";

/** The machine with its reading pauses removed: dice, AI turns and round ends run back to back. */
const instant = skyTeamMachine.provide({ delays: { autoStep: 0, aiStep: 0 } });

/**
 * Co-op, so a benchmark: both seats are the same AI, played through the same
 * machine the server runs (the AI, the dice and the automated round steps all
 * live there), on the default scenario. Records how often the plane lands.
 */
export const skyTeamSimulator: TournamentSimulator<Promise<GameOutcome>> = {
  playerCounts: [2],
  format: "benchmark",

  simulate({ strategies, seed }) {
    return playMachineToEnd(skyTeamSpec, instant, {
      strategies,
      seed,
      config: skyTeamManifest.config.parse({}),
      timeoutMs: 60_000,
    });
  },
};
