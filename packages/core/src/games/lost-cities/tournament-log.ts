import { CARD_INFO, NUM_COLORS } from "./mcts/types";
import { scoreGame } from "./scoring";
import type { Card, ExpeditionColor, GameState } from "./types";
import { EXPEDITION_COLORS } from "./types";

export const REPLAY_FORMAT_VERSION = 2;

export interface TournamentActionEntry {
  cardId: number;
  kind: number; // play: 0=expedition, 1=discard; draw: 0=pile, 1=discard
  phase: number; // 0=play, 1=draw
  player: number; // 0 or 1
  color?: number; // discard pile color (for draw from discard)
}

export interface ReplayStateSnapshot {
  hands: [number[], number[]];
  expeditions: number[][]; // 10 arrays: [0..4]=P0, [5..9]=P1
  discardPiles: number[][]; // 5 arrays
  drawPile: number[];
  scores: [number, number];
}

export interface ReplayAction {
  cardId: number;
  kind: number; // play: 0=expedition, 1=discard; draw: 0=pile, 1=discard
  color?: number; // for draw-from-discard
}

export interface MCTSActionStats {
  key: string;
  cardId?: number; // for play actions
  kind: number;
  color?: number; // for draw-from-discard
  visits: number;
  /** Mean normalized MCTS reward [0,1] — not P(win). */
  meanNormalizedReward?: number;
  /** @deprecated Older logs only; same meaning as `meanNormalizedReward`. */
  winRate?: number;
  chosen: boolean;
}

export interface MCTSDecisionData {
  play?: { actions: MCTSActionStats[] };
  draw?: { actions: MCTSActionStats[] };
}

export interface ReplayStepV2 {
  turn: number; // 0-based, increments per action
  phase: "play" | "draw";
  player: number; // 0 or 1
  state: ReplayStateSnapshot;
  action?: ReplayAction; // absent for step 0 (initial)
  mcts?: MCTSDecisionData; // only when AI made the decision
}

export interface TournamentGameLog {
  formatVersion: 2;
  gameIndex: number;
  strategyA: string;
  strategyB: string;
  aPlaysFirst: boolean;
  initialHands: [number[], number[]];
  initialDrawPile: number[];
  steps: ReplayStepV2[];
  scoreA: number;
  scoreB: number;
}

const CARD_LOOKUP: Card[] = (() => {
  const cards: Card[] = [];
  let id = 0;
  for (const color of EXPEDITION_COLORS) {
    for (let w = 0; w < 3; w++) {
      cards.push({ id: id++, color, type: "wager", value: 0 });
    }
    for (let v = 2; v <= 10; v++) {
      cards.push({ id: id++, color, type: "number", value: v });
    }
  }
  return cards;
})();

export function cardIdToCard(id: number): Card {
  return CARD_LOOKUP[id];
}

const COLOR_INDEX_TO_NAME: ExpeditionColor[] = EXPEDITION_COLORS;

export interface ReplayState {
  hands: [Card[], Card[]];
  expeditions: [Card[][], Card[][]]; // [player0's 5 colors, player1's 5 colors]
  discardPiles: Card[][]; // 5 colors
  drawPileCount: number;
  currentPlayer: number;
  turnPhase: number; // 0=play, 1=draw
  scores: [number, number];
  lastAction: TournamentActionEntry | null;
  lastActionDescription: string;
}

export function getReplaySteps(log: TournamentGameLog): ReplayStepV2[] {
  return log.steps;
}

/** Convert GameState to ReplayStateSnapshot for unified logging */
export function gameStateToSnapshot(state: GameState): ReplayStateSnapshot {
  const scores = scoreGame(state);
  const expeditions: number[][] = [];
  for (const p of [0, 1] as const) {
    for (const color of EXPEDITION_COLORS) {
      expeditions.push(state.expeditions[p][color].map((c) => c.id));
    }
  }
  const discardPiles: number[][] = EXPEDITION_COLORS.map((c) =>
    state.discardPiles[c].map((card) => card.id),
  );
  return {
    hands: [state.hands[0].map((c) => c.id), state.hands[1].map((c) => c.id)],
    expeditions,
    discardPiles,
    drawPile: state.drawPile.map((c) => c.id),
    scores: [scores[0].total, scores[1].total],
  };
}

/** Build TournamentGameLog from steps (used by both PvAI and tournament) */
export function buildGameLog(opts: {
  strategyA: string;
  strategyB: string;
  aPlaysFirst: boolean;
  steps: ReplayStepV2[];
  scoreA: number;
  scoreB: number;
  gameIndex?: number;
}): TournamentGameLog {
  const steps = opts.steps;
  const step0 = steps[0];
  if (!step0) throw new Error("buildGameLog requires at least one step");
  return {
    formatVersion: 2,
    gameIndex: opts.gameIndex ?? 0,
    strategyA: opts.strategyA,
    strategyB: opts.strategyB,
    aPlaysFirst: opts.aPlaysFirst,
    initialHands: [step0.state.hands[0].slice(), step0.state.hands[1].slice()],
    initialDrawPile: step0.state.drawPile.slice(),
    steps,
    scoreA: opts.scoreA,
    scoreB: opts.scoreB,
  };
}

/** Convert steps to ActionLogEntry[] for in-game History display */
export function stepsToActionLogEntries(steps: ReplayStepV2[]): import("./types").ActionLogEntry[] {
  const entries: import("./types").ActionLogEntry[] = [];
  let turn = 1;
  let lastPlayer: number | null = null;
  for (const step of steps) {
    if (!step.action) continue;
    if (step.player !== lastPlayer) {
      turn = lastPlayer !== null ? turn + 1 : 1;
      lastPlayer = step.player;
    }
    const card = cardIdToCard(step.action.cardId);
    const player = step.player as import("./types").PlayerIndex;
    const action =
      step.phase === "play"
        ? step.action.kind === 0
          ? "play-expedition"
          : "play-discard"
        : step.action.kind === 0
          ? "draw-pile"
          : "draw-discard";
    entries.push({
      turn,
      player,
      action,
      card,
      ...(step.action.kind === 1 && step.action.color !== undefined
        ? { color: EXPEDITION_COLORS[step.action.color] }
        : {}),
    });
  }
  return entries;
}

/** Action log entries for replay steps `0..throughIndex` (inclusive). */
export function stepsToActionLogEntriesThroughStep(
  steps: ReplayStepV2[],
  throughIndex: number,
): import("./types").ActionLogEntry[] {
  if (throughIndex < 0 || steps.length === 0) return [];
  const end = Math.min(throughIndex + 1, steps.length);
  return stepsToActionLogEntries(steps.slice(0, end));
}

/** Convert ReplayStepV2 to ReplayState for UI consumption */
export function stepToReplayState(step: ReplayStepV2): ReplayState {
  const snap = step.state;
  const expCards0: Card[][] = [];
  const expCards1: Card[][] = [];
  for (let c = 0; c < NUM_COLORS; c++) {
    expCards0.push(snap.expeditions[c].map(cardIdToCard));
    expCards1.push(snap.expeditions[NUM_COLORS + c].map(cardIdToCard));
  }
  const discCards: Card[][] = snap.discardPiles.map((p) => p.map(cardIdToCard));

  let lastActionDescription = "Initial deal";
  if (step.action) {
    const info = CARD_INFO[step.action.cardId];
    const colorName = COLOR_INDEX_TO_NAME[info.color];
    const card = cardIdToCard(step.action.cardId);
    const valueStr = card.type === "wager" ? "W" : String(card.value);
    if (step.phase === "play") {
      lastActionDescription =
        step.action.kind === 0
          ? `P${step.player}: Played ${colorName} ${valueStr} to expedition`
          : `P${step.player}: Discarded ${colorName} ${valueStr}`;
    } else {
      lastActionDescription =
        step.action.kind === 0
          ? `P${step.player}: Drew from draw pile (${card.color} ${valueStr})`
          : `P${step.player}: Drew ${COLOR_INDEX_TO_NAME[step.action.color ?? 0]} ${valueStr} from discard`;
    }
  }

  const lastAction: TournamentActionEntry | null = step.action
    ? {
        cardId: step.action.cardId,
        kind: step.action.kind,
        phase: step.phase === "play" ? 0 : 1,
        player: step.player,
        ...(step.action.kind === 1 && step.action.color !== undefined
          ? { color: step.action.color }
          : {}),
      }
    : null;

  return {
    hands: [snap.hands[0].map(cardIdToCard), snap.hands[1].map(cardIdToCard)],
    expeditions: [expCards0, expCards1],
    discardPiles: discCards,
    drawPileCount: snap.drawPile.length,
    currentPlayer: step.player,
    turnPhase: step.phase === "play" ? 0 : 1,
    scores: snap.scores,
    lastAction,
    lastActionDescription,
  };
}
