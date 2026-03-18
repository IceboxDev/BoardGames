import { type AIStrategy, ALL_STRATEGIES } from "./ai-strategies";
import { applyDrawFast, applyPlayFast, scorePlayerFast } from "./mcts/fast-game";
import { runMCTSFast } from "./mcts/ismcts";
import { CARD_INFO, type FastState, NUM_CARDS } from "./mcts/types";
import type { TournamentActionEntry, TournamentGameLog } from "./tournament-log";
import { shuffleInPlace } from "./utils";

function createFastInitialState(): FastState {
  const deck: number[] = [];
  for (let i = 0; i < NUM_CARDS; i++) deck.push(i);
  shuffleInPlace(deck);

  return {
    drawPile: deck.slice(16),
    discardPiles: [[], [], [], [], []],
    expeditions: [[], [], [], [], [], [], [], [], [], []],
    hands: [deck.slice(0, 8), deck.slice(8, 16)],
    currentPlayer: 0,
    turnPhase: 0,
    lastDiscardedColor: -1,
    gameOver: false,
  };
}

interface SimResult {
  scoreA: number;
  scoreB: number;
  log: TournamentGameLog;
}

function simulateGame(
  stratA: AIStrategy,
  stratB: AIStrategy,
  aPlaysFirst: boolean,
  gameIndex: number,
): SimResult {
  const state = createFastInitialState();
  const strats = aPlaysFirst ? [stratA, stratB] : [stratB, stratA];

  const initialHands: [number[], number[]] = [[...state.hands[0]], [...state.hands[1]]];
  const initialDrawPile = [...state.drawPile];
  const actions: TournamentActionEntry[] = [];

  while (!state.gameOver) {
    const player = state.currentPlayer;
    const strat = strats[player];

    const { play, draw } = runMCTSFast(state, player, strat);

    actions.push({
      cardId: play.cardId,
      kind: play.kind,
      phase: 0,
      player,
      ...(play.kind === 1 ? { color: CARD_INFO[play.cardId].color } : {}),
    });
    applyPlayFast(state, play);

    // Capture drawn card id before applying draw
    let drawnCardId: number;
    if (draw.kind === 0) {
      drawnCardId = state.drawPile[state.drawPile.length - 1];
    } else {
      const pile = state.discardPiles[draw.color];
      drawnCardId = pile[pile.length - 1];
    }

    actions.push({
      cardId: drawnCardId,
      kind: draw.kind,
      phase: 1,
      player,
      ...(draw.kind === 1 ? { color: draw.color } : {}),
    });
    applyDrawFast(state, draw);
  }

  const score0 = scorePlayerFast(state, 0);
  const score1 = scorePlayerFast(state, 1);

  const scoreA = aPlaysFirst ? score0 : score1;
  const scoreB = aPlaysFirst ? score1 : score0;

  return {
    scoreA,
    scoreB,
    log: {
      gameIndex,
      strategyA: stratA.id,
      strategyB: stratB.id,
      aPlaysFirst,
      initialHands,
      initialDrawPile,
      actions,
      scoreA,
      scoreB,
    },
  };
}

export interface TournamentRequest {
  strategyAId: string;
  strategyBId: string;
  numGames: number;
}

export interface TournamentProgress {
  kind: "progress";
  completed: number;
  total: number;
}

export interface TournamentComplete {
  kind: "complete";
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

export type TournamentMessage = TournamentProgress | TournamentComplete;

self.onmessage = (e: MessageEvent<TournamentRequest>) => {
  const { strategyAId, strategyBId, numGames } = e.data;

  const stratA = ALL_STRATEGIES.find((s) => s.id === strategyAId);
  const stratB = ALL_STRATEGIES.find((s) => s.id === strategyBId);

  if (!stratA || !stratB) {
    self.postMessage({
      kind: "complete",
      strategyA: strategyAId,
      strategyB: strategyBId,
      gamesPlayed: 0,
      aWins: 0,
      bWins: 0,
      draws: 0,
      totalScoreA: 0,
      totalScoreB: 0,
      games: [],
    } satisfies TournamentComplete);
    return;
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

    self.postMessage({
      kind: "progress",
      completed: i + 1,
      total: numGames,
    } satisfies TournamentProgress);
  }

  self.postMessage({
    kind: "complete",
    strategyA: strategyAId,
    strategyB: strategyBId,
    gamesPlayed: numGames,
    aWins,
    bWins,
    draws,
    totalScoreA,
    totalScoreB,
    games: allGames,
  } satisfies TournamentComplete);
};
