import { type AIStrategy, ALL_STRATEGIES } from "./ai-strategies";
import { applyDraw, applyPlay, createInitialState } from "./game-engine";
import { runISMCTSWithStats } from "./mcts/ismcts";
import { scoreGame } from "./scoring";
import type { MCTSActionStats, ReplayStepV2, TournamentGameLog } from "./tournament-log";
import { buildGameLog, gameStateToSnapshot } from "./tournament-log";
import type { PlayerIndex } from "./types";
import { EXPEDITION_COLORS } from "./types";

export interface SimResult {
  scoreA: number;
  scoreB: number;
  log: TournamentGameLog;
}

export function simulateGame(
  stratA: AIStrategy,
  stratB: AIStrategy,
  aPlaysFirst: boolean,
  gameIndex: number,
): SimResult {
  let state = createInitialState();
  const strats = aPlaysFirst ? [stratA, stratB] : [stratB, stratA];

  const steps: ReplayStepV2[] = [];

  steps.push({
    turn: 0,
    phase: "play",
    player: state.currentPlayer,
    state: gameStateToSnapshot(state),
  });

  let turn = 1;
  while (state.phase !== "game-over") {
    const player = state.currentPlayer;
    const strat = strats[player];

    const { move, stats } = runISMCTSWithStats(state, player as PlayerIndex, strat);

    // Play step
    state = applyPlay(state, move.play);
    const playMcts: MCTSActionStats[] = stats.playActions.map((a) => ({
      key: a.key,
      cardId: a.cardId,
      kind: a.kind,
      visits: a.visits,
      meanNormalizedReward: a.meanNormalizedReward,
      chosen: a.key === stats.chosenPlayKey,
    }));

    steps.push({
      turn,
      phase: "play",
      player,
      state: gameStateToSnapshot(state),
      action: {
        cardId: move.play.card.id,
        kind: move.play.kind === "expedition" ? 0 : 1,
        ...(move.play.kind === "discard"
          ? { color: EXPEDITION_COLORS.indexOf(move.play.card.color) }
          : {}),
      },
      mcts: { play: { actions: playMcts } },
    });
    turn++;

    // Capture drawn card ID before applyDraw removes it from the pile
    let drawnCardId: number;
    if (move.draw.kind === "draw-pile") {
      drawnCardId = state.drawPile[state.drawPile.length - 1].id;
    } else {
      const pile = state.discardPiles[move.draw.color];
      drawnCardId = pile[pile.length - 1].id;
    }

    // Draw step
    state = applyDraw(state, move.draw);
    const drawMcts: MCTSActionStats[] = stats.drawActions.map((a) => ({
      key: a.key,
      kind: a.kind,
      color: a.color,
      visits: a.visits,
      meanNormalizedReward: a.meanNormalizedReward,
      chosen: a.key === stats.chosenDrawKey,
    }));

    steps.push({
      turn,
      phase: "draw",
      player,
      state: gameStateToSnapshot(state),
      action: {
        cardId: drawnCardId,
        kind: move.draw.kind === "draw-pile" ? 0 : 1,
        ...(move.draw.kind === "discard-pile"
          ? { color: EXPEDITION_COLORS.indexOf(move.draw.color) }
          : {}),
      },
      mcts: { draw: { actions: drawMcts } },
    });
    turn++;
  }

  const scores = scoreGame(state);
  const score0 = scores[0].total;
  const score1 = scores[1].total;

  const scoreA = aPlaysFirst ? score0 : score1;
  const scoreB = aPlaysFirst ? score1 : score0;

  return {
    scoreA,
    scoreB,
    log: buildGameLog({
      strategyA: stratA.id,
      strategyB: stratB.id,
      aPlaysFirst,
      steps,
      scoreA,
      scoreB,
      gameIndex,
    }),
  };
}

export interface TournamentResult {
  strategyA: string;
  strategyB: string;
  gamesPlayed: number;
  aWins: number;
  bWins: number;
  draws: number;
  totalScoreA: number;
  totalScoreB: number;
  games: TournamentGameLog[];
}

export interface RunTournamentOptions {
  onProgress?: (completed: number, total: number) => void;
  getAbort?: () => boolean;
}

export interface TournamentProgressPartial {
  strategyA: string;
  strategyB: string;
  gamesPlayed: number;
  aWins: number;
  bWins: number;
  draws: number;
  totalScoreA: number;
  totalScoreB: number;
  games: TournamentGameLog[];
}

export function runTournament(
  strategyAId: string,
  strategyBId: string,
  numGames: number,
  options?: RunTournamentOptions,
): TournamentResult {
  const stratA = ALL_STRATEGIES.find((s) => s.id === strategyAId);
  const stratB = ALL_STRATEGIES.find((s) => s.id === strategyBId);

  if (!stratA || !stratB) {
    return {
      strategyA: strategyAId,
      strategyB: strategyBId,
      gamesPlayed: 0,
      aWins: 0,
      bWins: 0,
      draws: 0,
      totalScoreA: 0,
      totalScoreB: 0,
      games: [],
    };
  }

  let aWins = 0;
  let bWins = 0;
  let draws = 0;
  let totalScoreA = 0;
  let totalScoreB = 0;
  const allGames: TournamentGameLog[] = [];

  for (let i = 0; i < numGames; i++) {
    const aPlaysFirst = i % 2 === 0;
    const result = simulateGame(stratA, stratB, aPlaysFirst, i);

    totalScoreA += result.scoreA;
    totalScoreB += result.scoreB;
    allGames.push(result.log);

    if (result.scoreA > result.scoreB) aWins++;
    else if (result.scoreB > result.scoreA) bWins++;
    else draws++;

    options?.onProgress?.(i + 1, numGames);
  }

  return {
    strategyA: strategyAId,
    strategyB: strategyBId,
    gamesPlayed: numGames,
    aWins,
    bWins,
    draws,
    totalScoreA,
    totalScoreB,
    games: allGames,
  };
}
