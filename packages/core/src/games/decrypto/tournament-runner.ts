/**
 * Decrypto in the local tournament runner — the real machine, played to the
 * end with every seat an AI.
 *
 * By default the seats play the machine's built-in, model-free fallback agent
 * (`ai/fallback.ts`): deterministic, offline, free — and blind to the seat's
 * tier, so every matchup is a coin flip. That only proves the runner works.
 *
 * To measure the real tiers, opt in to the server's LLM agent
 * (`server/src/games/decrypto-agent.ts`, the one `withDecryptoAgent` binds on
 * the server). THIS BILLS THE MODEL for every clue and guess — a game is
 * dozens of calls, the Expert tier on a flagship model:
 *
 *   TOURNAMENT_LLM=1 AI_GATEWAY_API_KEY=… \
 *     pnpm --filter @boardgames/core tournament decrypto --games 4 --workers 1
 *
 * (`OPENAI_API_KEY` works instead of the gateway key; `DECRYPTO_MODEL_MEDIUM`
 * / `_HARD` / `_EXPERT` and `DECRYPTO_REASONING_EFFORT` pick the models as on
 * the server. Each call is also written to the AI ledger's local trace file.)
 */

import type { GameOutcome } from "../../machines/outcome";
import { playMachineToEnd } from "../../tournament/drive-machine";
import { importServerModule, isRecord } from "../../tournament/server-module";
import type { TournamentSimulator } from "../../tournament/simulator";
import type { DecryptoAiAgent } from "./ai/agent";
import { decryptoSpec, withDecryptoAgent } from "./machine";

/** No pauses between beats: nobody is watching. */
const NO_BEATS = { roundStart: 0, aiBeat: 0, reveal: 0, roundEnd: 0, clueTimeout: 0 };

const SERVER_AGENT = "games/decrypto-agent.ts";

const useLlm = process.env.TOURNAMENT_LLM === "1";

/**
 * The server's LLM agent, imported at run time by path so core never depends
 * on the server package (and nothing is loaded unless the run opted in).
 */
async function loadLlmAgent(): Promise<DecryptoAiAgent> {
  if (!process.env.AI_GATEWAY_API_KEY && !process.env.OPENAI_API_KEY) {
    throw new Error("TOURNAMENT_LLM=1 needs AI_GATEWAY_API_KEY or OPENAI_API_KEY");
  }
  const agent = (await importServerModule(SERVER_AGENT)).openAiDecryptoAgent;
  if (!isRecord(agent)) throw new Error(`${SERVER_AGENT} has no openAiDecryptoAgent`);
  const { encrypt, guess } = agent;
  if (typeof encrypt !== "function" || typeof guess !== "function") {
    throw new Error(`${SERVER_AGENT}: openAiDecryptoAgent is not an agent`);
  }
  // The machine sanitises whatever comes back against the rules.
  return {
    encrypt: (input) => Promise.resolve(encrypt.call(agent, input)),
    guess: (input) => Promise.resolve(guess.call(agent, input)),
  };
}

let machine: Promise<typeof decryptoSpec.machine> | null = null;
function tournamentMachine(): Promise<typeof decryptoSpec.machine> {
  machine ??= useLlm
    ? loadLlmAgent().then(withDecryptoAgent)
    : Promise.resolve(decryptoSpec.machine);
  return machine;
}

/** Model calls are slow; the model-free fallback finishes a game in well under a second. */
const GAME_TIMEOUT_MS = useLlm ? 60 * 60_000 : 60_000;

export const decryptoSimulator: TournamentSimulator<Promise<GameOutcome>> = {
  // Four seats are White (0–1) v Black (2–3). Three is the Interceptor
  // variant: White's pair transmits against a lone interceptor (seat 2), so
  // a strategy plays the pair in one game of the mirrored pair and the
  // interceptor in the other.
  playerCounts: [3, 4],
  // The LLM path is bounded by the gateway's rate limit, not cores.
  ...(useLlm ? { maxWorkers: 2 } : {}),

  sides(playerCount) {
    return playerCount === 3 ? [0, 0, 1] : [0, 0, 1, 1];
  },

  async simulate({ strategies, seed }) {
    return playMachineToEnd(
      decryptoSpec,
      await tournamentMachine(),
      {
        strategies,
        seed,
        config: decryptoSpec.manifest.config.parse({}),
        timeoutMs: GAME_TIMEOUT_MS,
      },
      // The pacing travels in START, not in the machine's delays.
      { start: (event) => (event.type === "START" ? { ...event, beats: NO_BEATS } : event) },
    );
  },
};
