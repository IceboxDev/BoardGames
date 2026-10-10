import type { TournamentSimulator } from "../../tournament/simulator";
import { chooseTsMove, type TsBot } from "./ai/choose";
import { thinkBudgetMs } from "./ai/services";
import { estimateDeadStones } from "./estimate";
import { newGame, play } from "./game";
import { goOutcome } from "./outcome";
import { areaScore } from "./scoring";

const SIZE = 9;
const MAX_MOVES = SIZE * SIZE * 4;

function bot(id: string): TsBot {
  if (id === "heuristic" || id === "mcts") return id;
  throw new Error(
    `Go's "${id}" needs KataGo, which the local runner doesn't drive — use --strategies heuristic,mcts`,
  );
}

/** 9×9, even game, 7.5 komi; the end is counted with Monte Carlo dead stones. */
export const goSimulator: TournamentSimulator = {
  playerCounts: [2],

  simulate({ strategies, seed }) {
    const bots = strategies.map(bot);
    let game = newGame({ size: SIZE, komi: 7.5, handicap: 0 });
    while (game.consecutivePasses < 2) {
      if (game.moves.length >= MAX_MOVES) throw new Error("Go game did not finish");
      const who = bots[game.toMove] as TsBot;
      const point = chooseTsMove(game, who, {
        timeMs: thinkBudgetMs(who, SIZE) / 3,
        seed: seed + game.moves.length,
      });
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
