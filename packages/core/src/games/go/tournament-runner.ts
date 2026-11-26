/**
 * Go in the local tournament runner. Pebble and Brook think here, in-thread;
 * the `katago-*` tiers are played by the server's own KataGo mover
 * (`server/src/katago/go-agent.ts`: the human-style policy sampled at 5 kyu /
 * 1 kyu / 5 dan, a search for KataGo itself), loaded at run time so core never
 * depends on the server package. It needs a local engine:
 *
 *   KATAGO_BIN=… KATAGO_MODEL=… KATAGO_HUMAN_MODEL=… \
 *     pnpm --filter @boardgames/core tournament go --games 20 --workers 3
 *
 * Unlike the server, a KataGo failure is not covered by Brook: a "KataGo" seat
 * that played MCTS would make the results a lie, so the game fails and the
 * runner writes nothing.
 */

import type { GameOutcome } from "../../machines/outcome";
import { importServerModule, isRecord } from "../../tournament/server-module";
import type { TournamentSimulator } from "../../tournament/simulator";
import { chooseTsMove, type TsBot } from "./ai/choose";
import { type GoMoveRequest, thinkBudgetMs } from "./ai/services";
import { estimateDeadStones } from "./estimate";
import { newGame, play } from "./game";
import type { GoStrategy } from "./manifest";
import { goOutcome } from "./outcome";
import { areaScore } from "./scoring";

const SIZE = 9;
const MAX_MOVES = SIZE * SIZE * 4;

const isTsBot = (id: string): id is TsBot => id === "heuristic" || id === "mcts";

type KataGoMove = (req: GoMoveRequest) => Promise<number | null>;

let kataGo: Promise<KataGoMove> | undefined;

/** The server's KataGo mover, once per worker; throws when no engine is configured. */
function kataGoMove(): Promise<KataGoMove> {
  kataGo ??= (async () => {
    const mod = await importServerModule("katago/go-agent.ts");
    if (typeof mod.kataGoMover !== "function")
      throw new Error("server KataGo module changed shape");
    const mover: unknown = mod.kataGoMover();
    if (!isRecord(mover) || typeof mover.move !== "function") {
      throw new Error(
        "KataGo isn't configured: set KATAGO_BIN, KATAGO_MODEL and KATAGO_HUMAN_MODEL for the katago-* tiers",
      );
    }
    const move = mover.move as (req: GoMoveRequest) => Promise<unknown>;
    return async (req) => {
      const point = await move.call(mover, req);
      if (point !== null && typeof point !== "number") throw new Error("KataGo returned no move");
      return point;
    };
  })();
  return kataGo;
}

/**
 * 9×9, even game, 7.5 komi; the end — two passes, or the move cap — is counted
 * with Monte Carlo dead stones.
 */
export const goSimulator: TournamentSimulator<Promise<GameOutcome>> = {
  playerCounts: [2],

  async simulate({ strategies, seed }) {
    const bots = strategies as GoStrategy[];
    const engine = bots.some((b) => !isTsBot(b)) ? await kataGoMove() : null;
    let game = newGame({ size: SIZE, komi: 7.5, handicap: 0 });
    // Bots that never pass (a sampled human-style tier keeps finding a move)
    // are scored where they stand at the cap, as a referee would adjudicate.
    while (game.consecutivePasses < 2 && game.moves.length < MAX_MOVES) {
      const who = bots[game.toMove] as GoStrategy;
      const moveSeed = seed + game.moves.length;
      let point: number | null;
      if (isTsBot(who)) {
        point = chooseTsMove(game, who, { timeMs: thinkBudgetMs(who, SIZE) / 3, seed: moveSeed });
      } else {
        if (!engine) throw new Error(`no KataGo for ${who}`);
        // The live tier's own budget: what the server gives the same request.
        point = await engine({
          game,
          strategy: who,
          timeMs: thinkBudgetMs(who, SIZE),
          seed: moveSeed,
        });
      }
      game = play(game, point);
    }
    const dead = estimateDeadStones(game, 400, seed);
    const breakdown = areaScore(game.board, SIZE, dead, game.komi, game.handicap);
    return goOutcome({
      reason: "score",
      winner: breakdown.winner,
      result: breakdown.result,
      breakdown,
      dead,
    });
  },
};
