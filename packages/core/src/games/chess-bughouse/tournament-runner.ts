/**
 * Bughouse in the local tournament runner: the game's own machine (both boards
 * at once), every seat an AI, the Fairy-Stockfish tiers played by the server's
 * own engine pool and tier table (see `chess/tournament-runner.ts`). `random`
 * plays the machine's built-in move, as on the server.
 *
 * Partners are seats {0, 3} and {1, 2}, so a mirrored pair seats strategy A as
 * one partnership and B as the other, then swaps them on the same seed.
 * Untimed, as for chess, so the result never depends on the machine's load —
 * the server's default is 3+0. Each worker holds one Fairy-Stockfish (~360 MB)
 * that both boards share:
 *
 *   pnpm --filter @boardgames/core tournament chess-bughouse --games 20 --workers 3
 */

import type { GameOutcome } from "../../machines/outcome";
import { playMachineToEnd } from "../../tournament/drive-machine";
import type { TournamentSimulator } from "../../tournament/simulator";
import { GAME_TIMEOUT_MS, serverEngineAgent, strictAgent } from "../chess/tournament-runner";
import { TEAM_OF } from "./game";
import { bughouseSpec, withBughouseAgent } from "./machine";
import { bughouseManifest } from "./manifest";

const CONFIG = bughouseManifest.config.parse({ timeControl: null });

export const bughouseSimulator: TournamentSimulator<Promise<GameOutcome>> = {
  playerCounts: [4],
  // Fairy-Stockfish is ~360 MB a process.
  maxWorkers: 3,

  sides: () => TEAM_OF,

  async simulate({ strategies, seed }) {
    const abort = new AbortController();
    const engine = strategies.some((s) => s.startsWith("fairy-"))
      ? strictAgent(await serverEngineAgent("bughouse"), abort)
      : null;
    const machine = engine ? withBughouseAgent(engine) : bughouseSpec.machine;
    return playMachineToEnd(
      bughouseSpec,
      machine.provide({ delays: { aiPace: 0 } }),
      { strategies, seed, config: CONFIG, timeoutMs: GAME_TIMEOUT_MS },
      { signal: abort.signal },
    );
  },
};
