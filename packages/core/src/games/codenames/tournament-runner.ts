/**
 * Codenames for the local tournament runner: the real machine, AI seats only,
 * teams by seat index (`seating.ts`: even seats Red, odd seats Blue — the
 * runner's default sides).
 *
 * By default every seat plays the keyless stand-in (`ai/fallback.ts`) — what
 * the server plays without a model. It makes no network call and reads no
 * key, and it plays every tier the same way, so its results only prove the
 * plumbing.
 *
 * For real tiers set TOURNAMENT_LLM=1 plus the server's AI key; the runner
 * then binds the server's own LLM agent (`server/src/games/codenames-agent.ts`),
 * exactly as `withCodenamesAgent` does per session. THIS BILLS the model for
 * every clue and every guess (Mastermind clues also pay for test reads):
 *
 *   TOURNAMENT_LLM=1 AI_GATEWAY_API_KEY=… \
 *     pnpm --filter @boardgames/core tournament codenames --games 10 --workers 1 --players 4
 *
 * (OPENAI_API_KEY also works; CODENAMES_MODEL_* / CODENAMES_*REASONING_EFFORT
 * override tiers as on the server. The server's .env.local is not read here —
 * export the variables.) Each call is logged by the server's AI ledger.
 */

import type { GameOutcome } from "../../machines/outcome";
import { playMachineToEnd } from "../../tournament/drive-machine";
import { importServerModule, isRecord } from "../../tournament/server-module";
import type { TournamentSimulator } from "../../tournament/simulator";
import type { CodenamesAiAgent } from "./ai/agent";
import { codenamesMachine, codenamesSpec, withCodenamesAgent } from "./machine";
import { CodenamesConfigSchema } from "./manifest";

/** Well above the machine's own 90 s clue / 45 s guess deadlines, times a game's turns. */
export const GAME_TIMEOUT_MS = 60 * 60_000;

/** The pacing beats only exist for people watching; a tournament skips them. */
export const NO_BEATS = { delays: { aiStart: 0, aiGuess: 0 } } as const;

/** Whether the run opted in to the paid LLM agent. */
export function llmOptIn(): boolean {
  return process.env.TOURNAMENT_LLM === "1";
}

let agent: Promise<CodenamesAiAgent> | undefined;

/**
 * The server's LLM agent, imported by path at run time so core's typecheck
 * never follows it into the server package. Refuses to run without a key, so
 * an opted-in run can't silently fall back to the stand-in.
 */
export function serverCodenamesAgent(): Promise<CodenamesAiAgent> {
  agent ??= (async () => {
    const config = await importServerModule("lib/ai/config.ts");
    const mod = await importServerModule("games/codenames-agent.ts");
    const available = config.aiAvailable;
    if (typeof available !== "function" || !available()) {
      throw new Error("TOURNAMENT_LLM=1 but no AI key (AI_GATEWAY_API_KEY / OPENAI_API_KEY)");
    }
    const found = mod.llmCodenamesAgent;
    if (!isAgent(found)) throw new Error("server codenames-agent has no llmCodenamesAgent");
    return found;
  })();
  return agent;
}

// The one narrowing at the dynamic-import seam: the server module is typed
// against this very interface, so checking its two methods is enough.
function isAgent(value: unknown): value is CodenamesAiAgent {
  return (
    isRecord(value) && typeof value.giveClue === "function" && typeof value.guess === "function"
  );
}

export const codenamesSimulator: TournamentSimulator<Promise<GameOutcome>> = {
  playerCounts: [4, 6, 8],

  async simulate({ strategies, seed }) {
    const base = llmOptIn() ? withCodenamesAgent(await serverCodenamesAgent()) : codenamesMachine;
    return playMachineToEnd(codenamesSpec, base.provide(NO_BEATS), {
      strategies,
      seed,
      config: CodenamesConfigSchema.parse({}),
      timeoutMs: GAME_TIMEOUT_MS,
    });
  },
};
