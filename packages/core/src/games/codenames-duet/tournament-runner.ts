/**
 * Codenames: Duet for the local tournament runner — a co-op benchmark: both
 * seats play one tier, and the file records how often the pair wins.
 *
 * By default both seats play the keyless stand-in (`codenames/ai/fallback.ts`),
 * which makes no network call and plays every tier alike — plumbing only.
 * For real tiers set TOURNAMENT_LLM=1 plus the server's AI key; the server's
 * own LLM agent is bound exactly as `withDuetAgent` does per session. THIS
 * BILLS the model for every clue and every guess:
 *
 *   TOURNAMENT_LLM=1 AI_GATEWAY_API_KEY=… \
 *     pnpm --filter @boardgames/core tournament codenames-duet --games 10 --workers 1
 *
 * See `codenames/tournament-runner.ts` for the other variables.
 */

import type { GameOutcome } from "../../machines/outcome";
import { playMachineToEnd } from "../../tournament/drive-machine";
import type { TournamentSimulator } from "../../tournament/simulator";
import {
  GAME_TIMEOUT_MS,
  llmOptIn,
  NO_BEATS,
  serverCodenamesAgent,
} from "../codenames/tournament-runner";
import { duetMachine, duetSpec, withDuetAgent } from "./machine";
import { DuetConfigSchema } from "./manifest";

export const duetSimulator: TournamentSimulator<Promise<GameOutcome>> = {
  playerCounts: [2],
  format: "benchmark",

  async simulate({ strategies, seed }) {
    const base = llmOptIn() ? withDuetAgent(await serverCodenamesAgent()) : duetMachine;
    return playMachineToEnd(duetSpec, base.provide(NO_BEATS), {
      strategies,
      seed,
      config: DuetConfigSchema.parse({}),
      timeoutMs: GAME_TIMEOUT_MS,
    });
  },
};
