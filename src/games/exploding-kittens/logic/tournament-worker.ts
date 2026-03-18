import { applyActionFast, getActivePlayerFast, getLegalActionsFast } from "./mcts/fast-game";
import type { FastAction, FastState } from "./mcts/types";
import {
  ACT_ACK_PEEK,
  ACT_DEFUSE,
  ACT_END_ACTION,
  ACT_PASS_NOPE,
  ACT_PLAY_CARD,
  ACT_REINSERT,
  ACT_SKIP_DEFUSE,
  CARD_TYPE_FOR_ID,
  CT_ATTACK,
  CT_DEFUSE,
  CT_EXPLODING,
  CT_SKIP,
  PH_ACTION,
  PH_GAME_OVER,
  TOTAL_CARDS,
} from "./mcts/types";
import type { AIStrategyId } from "./types";

function shuffleArray(arr: number[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function createFastInitialState(playerCount: number): FastState {
  const allIds: number[] = [];
  for (let i = 0; i < TOTAL_CARDS; i++) allIds.push(i);

  const kittens = allIds.filter((id) => CARD_TYPE_FOR_ID[id] === CT_EXPLODING);
  const defuses = allIds.filter((id) => CARD_TYPE_FOR_ID[id] === CT_DEFUSE);
  const rest = allIds.filter(
    (id) => CARD_TYPE_FOR_ID[id] !== CT_EXPLODING && CARD_TYPE_FOR_ID[id] !== CT_DEFUSE,
  );

  shuffleArray(rest);

  const hands: number[][] = [];
  let ptr = 0;
  for (let p = 0; p < playerCount; p++) {
    const hand = rest.slice(ptr, ptr + 7);
    hand.push(defuses[p]);
    hands.push(hand);
    ptr += 7;
  }

  const remaining = rest.slice(ptr);
  const extraDefuses = defuses.slice(playerCount);
  const kittensToInsert = kittens.slice(0, playerCount - 1);
  const drawPile = [...remaining, ...extraDefuses, ...kittensToInsert];
  shuffleArray(drawPile);

  return {
    drawPile,
    discardPile: [],
    hands,
    alive: new Array(playerCount).fill(true),
    currentPlayer: 0,
    turnsRemaining: 1,
    phase: PH_ACTION,
    gameOver: false,
    winner: -1,
    playerCount,
    nopeSourcePlayer: -1,
    nopeEffectType: -1,
    nopeChainLength: 0,
    nopePollingPlayer: -1,
    nopePassed: new Array(playerCount).fill(false),
    favorFrom: -1,
    favorTarget: -1,
    stealFrom: -1,
    stealTarget: -1,
    stealIsNamed: false,
    explodingPlayer: -1,
    explodingCardId: -1,
  };
}

const MAX_GAME_STEPS = 2000;

function pickFast(strategyId: AIStrategyId, state: FastState, actions: FastAction[]): FastAction {
  if (strategyId === "heuristic-v1") {
    return heuristicPickFast(state, actions);
  }
  return actions[Math.floor(Math.random() * actions.length)];
}

function heuristicPickFast(s: FastState, actions: FastAction[]): FastAction {
  const defuse = actions.find((a) => a.kind === ACT_DEFUSE);
  if (defuse) return defuse;

  const skipDefuse = actions.find((a) => a.kind === ACT_SKIP_DEFUSE);
  if (skipDefuse && actions.length === 1) return skipDefuse;

  const ack = actions.find((a) => a.kind === ACT_ACK_PEEK);
  if (ack) return ack;

  const reinsert = actions.filter((a) => a.kind === ACT_REINSERT);
  if (reinsert.length > 0) return reinsert[reinsert.length - 1];

  const pass = actions.find((a) => a.kind === ACT_PASS_NOPE);
  if (pass && Math.random() < 0.7) return pass;

  const attack = actions.find(
    (a) => a.kind === ACT_PLAY_CARD && CARD_TYPE_FOR_ID[a.cardId] === CT_ATTACK,
  );
  if (attack && s.hands[s.currentPlayer].length <= 3) return attack;

  const skip = actions.find(
    (a) => a.kind === ACT_PLAY_CARD && CARD_TYPE_FOR_ID[a.cardId] === CT_SKIP,
  );
  if (skip && s.hands[s.currentPlayer].length <= 2) return skip;

  const endAction = actions.find((a) => a.kind === ACT_END_ACTION);
  if (endAction) return endAction;

  return actions[Math.floor(Math.random() * actions.length)];
}

function simulateGame(strategies: AIStrategyId[], firstPlayerOffset: number): number {
  const playerCount = strategies.length;
  const state = createFastInitialState(playerCount);
  state.currentPlayer = firstPlayerOffset % playerCount;

  let steps = 0;
  while (!state.gameOver && state.phase !== PH_GAME_OVER && steps < MAX_GAME_STEPS) {
    const actions = getLegalActionsFast(state);
    if (actions.length === 0) break;

    const activePlayer = getActivePlayerFast(state);
    const picked = pickFast(strategies[activePlayer], state, actions);
    applyActionFast(state, picked);
    steps++;
  }

  return state.winner;
}

// ── Tournament Protocol ─────────────────────────────────────────────────────

export interface TournamentRequest {
  strategies: AIStrategyId[];
  numGames: number;
}

export interface TournamentProgress {
  kind: "progress";
  completed: number;
  total: number;
}

export interface TournamentComplete {
  kind: "complete";
  strategies: AIStrategyId[];
  gamesPlayed: number;
  wins: Record<string, number>;
  avgSurvivalRank: Record<string, number>;
}

export type TournamentMessage = TournamentProgress | TournamentComplete;

self.onmessage = (e: MessageEvent<TournamentRequest>) => {
  const { strategies, numGames } = e.data;
  const playerCount = strategies.length;

  const wins: Record<string, number> = {};
  for (const s of strategies) {
    wins[s] = 0;
  }

  for (let i = 0; i < numGames; i++) {
    const winner = simulateGame(strategies, i);

    if (winner >= 0 && winner < playerCount) {
      wins[strategies[winner]] = (wins[strategies[winner]] ?? 0) + 1;
    }

    self.postMessage({
      kind: "progress",
      completed: i + 1,
      total: numGames,
    } satisfies TournamentProgress);
  }

  const avgSurvivalRank: Record<string, number> = {};
  for (const s of strategies) {
    avgSurvivalRank[s] = 0;
  }

  self.postMessage({
    kind: "complete",
    strategies,
    gamesPlayed: numGames,
    wins,
    avgSurvivalRank,
  } satisfies TournamentComplete);
};
