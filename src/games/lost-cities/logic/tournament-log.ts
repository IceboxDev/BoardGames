import { scoreExpeditionFast } from "./mcts/fast-game";
import { CARD_INFO, NUM_COLORS } from "./mcts/types";
import type { Card, ExpeditionColor } from "./types";
import { EXPEDITION_COLORS } from "./types";

export interface TournamentActionEntry {
  cardId: number;
  kind: number; // play: 0=expedition, 1=discard; draw: 0=pile, 1=discard
  phase: number; // 0=play, 1=draw
  player: number; // 0 or 1
  color?: number; // discard pile color (for draw from discard)
}

export interface TournamentGameLog {
  gameIndex: number;
  strategyA: string;
  strategyB: string;
  aPlaysFirst: boolean;
  initialHands: [number[], number[]];
  initialDrawPile: number[];
  actions: TournamentActionEntry[];
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

export function reconstructStates(log: TournamentGameLog): ReplayState[] {
  const hands: [number[], number[]] = [[...log.initialHands[0]], [...log.initialHands[1]]];
  const expeditions: number[][] = Array.from({ length: 10 }, () => []);
  const discardPiles: number[][] = Array.from({ length: 5 }, () => []);
  const drawPile = [...log.initialDrawPile];

  function snapshot(action: TournamentActionEntry | null, desc: string): ReplayState {
    const expCards0: Card[][] = [];
    const expCards1: Card[][] = [];
    for (let c = 0; c < NUM_COLORS; c++) {
      expCards0.push(expeditions[c].map(cardIdToCard));
      expCards1.push(expeditions[NUM_COLORS + c].map(cardIdToCard));
    }

    const discCards: Card[][] = [];
    for (let c = 0; c < NUM_COLORS; c++) {
      discCards.push(discardPiles[c].map(cardIdToCard));
    }

    return {
      hands: [hands[0].map(cardIdToCard), hands[1].map(cardIdToCard)],
      expeditions: [expCards0, expCards1],
      discardPiles: discCards,
      drawPileCount: drawPile.length,
      currentPlayer: action ? action.player : 0,
      turnPhase: 0,
      scores: [computeScore(expeditions, 0), computeScore(expeditions, 1)],
      lastAction: action,
      lastActionDescription: desc,
    };
  }

  const states: ReplayState[] = [];
  states.push(snapshot(null, "Initial deal"));

  for (const a of log.actions) {
    if (a.phase === 0) {
      // Play action
      const idx = hands[a.player].indexOf(a.cardId);
      if (idx >= 0) hands[a.player].splice(idx, 1);

      const info = CARD_INFO[a.cardId];
      const card = cardIdToCard(a.cardId);
      const colorName = COLOR_INDEX_TO_NAME[info.color];
      const valueStr = card.type === "wager" ? "W" : String(card.value);

      if (a.kind === 0) {
        expeditions[a.player * NUM_COLORS + info.color].push(a.cardId);
        states.push(snapshot(a, `P${a.player}: Played ${colorName} ${valueStr} to expedition`));
      } else {
        discardPiles[info.color].push(a.cardId);
        states.push(snapshot(a, `P${a.player}: Discarded ${colorName} ${valueStr}`));
      }
    } else {
      // Draw action
      const card = cardIdToCard(a.cardId);
      const valueStr = card.type === "wager" ? "W" : String(card.value);

      if (a.kind === 0) {
        const topIdx = drawPile.lastIndexOf(a.cardId);
        if (topIdx >= 0) drawPile.splice(topIdx, 1);
        hands[a.player].push(a.cardId);
        states.push(snapshot(a, `P${a.player}: Drew from draw pile (${card.color} ${valueStr})`));
      } else {
        const colorName = COLOR_INDEX_TO_NAME[a.color!];
        const pile = discardPiles[a.color!];
        const pIdx = pile.lastIndexOf(a.cardId);
        if (pIdx >= 0) pile.splice(pIdx, 1);
        hands[a.player].push(a.cardId);
        states.push(snapshot(a, `P${a.player}: Drew ${colorName} ${valueStr} from discard`));
      }
    }
  }

  return states;
}

function computeScore(expeditions: number[][], player: number): number {
  let total = 0;
  const offset = player * NUM_COLORS;
  for (let c = 0; c < NUM_COLORS; c++) {
    total += scoreExpeditionFast(expeditions[offset + c]);
  }
  return total;
}
