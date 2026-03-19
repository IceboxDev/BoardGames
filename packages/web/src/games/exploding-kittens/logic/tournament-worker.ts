import {
  runTournament,
  type TournamentResult,
} from "@boardgames/core/games/exploding-kittens/tournament-runner";
import type { AIStrategyId } from "@boardgames/core/games/exploding-kittens/types";

export interface TournamentRequest {
  strategies: AIStrategyId[];
  numGames: number;
}

export interface TournamentProgress {
  kind: "progress";
  completed: number;
  total: number;
}

export interface TournamentComplete extends TournamentResult {
  kind: "complete";
}

export type TournamentMessage = TournamentProgress | TournamentComplete;

self.onmessage = (e: MessageEvent<TournamentRequest>) => {
  const { strategies, numGames } = e.data;

  const result = runTournament(strategies, numGames, {
    onProgress(completed, total) {
      self.postMessage({
        kind: "progress",
        completed,
        total,
      } satisfies TournamentProgress);
    },
  });

  self.postMessage({
    kind: "complete",
    ...result,
  } satisfies TournamentComplete);
};
