/**
 * 7 Wonders in the local tournament runner: the game's own machine, driven to
 * the end with no reveal pause, its `search` seats bound to the same C++
 * search the server runs (`server/src/games/seven-wonders-agent.ts`: `sw7 move`
 * with the same binary, env and defaults). Needs the binary — build it with
 * `make -C cpp/seven-wonders cli`, or point SW7_BIN at one.
 *
 * Unlike the server, a failed search does not quietly play a random move: a
 * "search" seat that played randomly would make the results a lie, so the
 * game fails and the runner writes nothing.
 *
 * The engine is fixed at 5 players (`constexpr int N` in the C++), so that is
 * the only table size.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import type { GameOutcome } from "../../machines/outcome";
import { playMachineToEnd } from "../../tournament/drive-machine";
import type { TournamentSimulator } from "../../tournament/simulator";
import type { SevenWondersAgent } from "./ai/agent";
import { matchCanon, serializePosition } from "./ai/cpp-bridge";
import { sevenWondersSpec, withSevenWondersAgent } from "./machine";

const DEFAULT_BIN = fileURLToPath(
  new URL("../../../../../cpp/seven-wonders/build/sw7", import.meta.url),
);
const SW7 = process.env.SW7_BIN ?? DEFAULT_BIN;
const WEIGHTS = process.env.SW7_WEIGHTS ?? "-";
const ITERS = process.env.SW7_ITERS ?? "1200";
const DETS = process.env.SW7_DETS ?? "4";
/** The C++ engine's only table size. */
const ENGINE_SEATS = 5;
/** A whole game, all decisions included — far above what one needs. */
const GAME_TIMEOUT_MS = 10 * 60_000;

const execFileAsync = promisify(execFile);

/** The server's agent, except that every failure throws instead of declining. */
const searchAgent: SevenWondersAgent = async (gs, seat) => {
  const child = execFileAsync(SW7, ["move", WEIGHTS, ITERS, DETS], {
    timeout: 8000,
    maxBuffer: 1 << 20,
  });
  child.child.stdin?.end(serializePosition(gs, seat));
  const canon = (await child).stdout.trim().split(/\s+/).map(Number);
  if (canon.length !== 5 || canon.some(Number.isNaN)) {
    throw new Error(`sw7 answered "${canon.join(" ")}"`);
  }
  const action = matchCanon(gs, seat, canon as [number, number, number, number, number]);
  if (!action) throw new Error(`sw7's move ${canon.join(" ")} is not legal for seat ${seat}`);
  return action;
};

export const sevenWondersSimulator: TournamentSimulator<Promise<GameOutcome>> = {
  playerCounts: [ENGINE_SEATS],

  simulate({ strategies, seed }) {
    if (strategies.includes("search")) {
      if (strategies.length !== ENGINE_SEATS) {
        throw new Error(`the C++ search only plays ${ENGINE_SEATS}-player games`);
      }
      if (!existsSync(SW7)) {
        throw new Error(`no sw7 binary at ${SW7} — run \`make -C cpp/seven-wonders cli\``);
      }
    }

    // The machine retries a failed AI turn; the first failure ends the game here.
    const abort = new AbortController();
    const agent: SevenWondersAgent = async (gs, seat) => {
      try {
        return await searchAgent(gs, seat);
      } catch (err) {
        abort.abort(err);
        throw err;
      }
    };
    return playMachineToEnd(
      sevenWondersSpec,
      withSevenWondersAgent(agent).provide({ delays: { revealDelay: 0 } }),
      {
        strategies,
        seed,
        config: sevenWondersSpec.manifest.config.parse({}),
        timeoutMs: GAME_TIMEOUT_MS,
      },
      { signal: abort.signal },
    );
  },
};
