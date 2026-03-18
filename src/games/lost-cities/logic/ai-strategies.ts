import { canPlayToExpedition } from "./mcts/fast-game";
import {
  CARD_INFO,
  type DrawActionFast,
  type FastState,
  type MCTSConfig,
  NUM_COLORS,
  type PickDrawFn,
  type PickPlayFn,
  type PlayActionFast,
} from "./mcts/types";

export interface AIStrategy {
  id: string;
  label: string;
  description: string;
  pickPlay: PickPlayFn;
  pickDraw: PickDrawFn;
  mctsConfig: MCTSConfig;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function countHandCardsOfColor(s: FastState, player: number, color: number): number {
  let count = 0;
  for (const cardId of s.hands[player]) {
    if (CARD_INFO[cardId].color === color) count++;
  }
  return count;
}

function handColorStats(
  s: FastState,
  player: number,
  color: number,
): { count: number; valueSum: number } {
  let count = 0;
  let valueSum = 0;
  for (const cardId of s.hands[player]) {
    const info = CARD_INFO[cardId];
    if (info.color === color) {
      count++;
      valueSum += info.type === 1 ? info.value : 0;
    }
  }
  return { count, valueSum };
}

// ---------------------------------------------------------------------------
// V1 heuristics (original weak penalties)
// ---------------------------------------------------------------------------

function pickPlayV1(s: FastState, plays: PlayActionFast[]): PlayActionFast {
  let bestScore = -Infinity;
  let best = plays[0];

  const player = s.currentPlayer;
  const expOffset = player * NUM_COLORS;
  const oppOffset = (1 - player) * NUM_COLORS;

  for (const play of plays) {
    const info = CARD_INFO[play.cardId];
    let score = 0;

    if (play.kind === 0) {
      const exp = s.expeditions[expOffset + info.color];
      if (exp.length > 0) {
        score += 20 + info.value;
      } else {
        const handCards = countHandCardsOfColor(s, player, info.color);
        if (handCards >= 3) {
          score += 8 + info.value;
        } else if (info.type === 0) {
          score += 2;
        } else {
          score += 5;
        }
      }
      if (exp.length >= 5) score += 5;
    } else {
      const myExp = s.expeditions[expOffset + info.color];
      const oppExp = s.expeditions[oppOffset + info.color];
      if (myExp.length > 0) score -= 10;
      if (oppExp.length > 0) score -= 6;
      score += info.type === 0 ? 1 : (10 - info.value) * 0.3;
      if (myExp.length === 0) score += 3;
    }

    if (score > bestScore) {
      bestScore = score;
      best = play;
    }
  }

  return best;
}

function pickDrawV1(s: FastState, draws: DrawActionFast[]): DrawActionFast {
  const player = s.currentPlayer;
  const expOffset = player * NUM_COLORS;

  let bestScore = -Infinity;
  let best = draws[0];

  for (const draw of draws) {
    let score = 0;

    if (draw.kind === 0) {
      score = 5;
    } else {
      const pile = s.discardPiles[draw.color];
      if (pile.length === 0) continue;
      const topCard = pile[pile.length - 1];
      const info = CARD_INFO[topCard];
      const exp = s.expeditions[expOffset + info.color];

      if (exp.length > 0) {
        const lastInfo = CARD_INFO[exp[exp.length - 1]];
        if (
          (info.type === 0 && lastInfo.type === 0) ||
          (info.type === 1 && info.value > lastInfo.value)
        ) {
          score = 15 + info.value;
        } else {
          score = 2;
        }
      } else {
        score = 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = draw;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// V2 heuristics (strong penalties, better value weighting)
// ---------------------------------------------------------------------------

function pickPlayV2(s: FastState, plays: PlayActionFast[]): PlayActionFast {
  let bestScore = -Infinity;
  let best = plays[0];

  const player = s.currentPlayer;
  const expOffset = player * NUM_COLORS;
  const oppOffset = (1 - player) * NUM_COLORS;

  for (const play of plays) {
    const info = CARD_INFO[play.cardId];
    let score = 0;

    if (play.kind === 0) {
      const exp = s.expeditions[expOffset + info.color];

      if (exp.length > 0) {
        score = 30 + info.value * 2;
        if (exp.length >= 5) score += 8;
        if (exp.length >= 7) score += 15;
      } else {
        const stats = handColorStats(s, player, info.color);
        if (info.type === 0) {
          score = stats.count >= 4 && stats.valueSum >= 15 ? 8 : -20;
        } else {
          if (stats.count >= 3 && stats.valueSum >= 18) {
            score = 6 + info.value;
          } else if (stats.count >= 2 && info.value >= 7) {
            score = 2;
          } else {
            score = -10;
          }
        }
      }
    } else {
      const myExp = s.expeditions[expOffset + info.color];
      const oppExp = s.expeditions[oppOffset + info.color];

      if (myExp.length > 0 && canPlayToExpedition(play.cardId, myExp)) {
        score = -35;
      } else if (myExp.length > 0) {
        score = -15;
      } else {
        score = 4;
      }

      if (oppExp.length > 0) score -= 8;

      if (info.type === 0) {
        score -= 2;
      } else {
        score += (10 - info.value) * 0.5;
      }

      if (myExp.length === 0 && oppExp.length === 0) score += 3;
    }

    if (score > bestScore) {
      bestScore = score;
      best = play;
    }
  }

  return best;
}

function pickDrawV2(s: FastState, draws: DrawActionFast[]): DrawActionFast {
  const player = s.currentPlayer;
  const expOffset = player * NUM_COLORS;

  let bestScore = -Infinity;
  let best = draws[0];

  for (const draw of draws) {
    let score = 0;

    if (draw.kind === 0) {
      score = 6;
    } else {
      const pile = s.discardPiles[draw.color];
      if (pile.length === 0) continue;
      const topCard = pile[pile.length - 1];
      const info = CARD_INFO[topCard];
      const exp = s.expeditions[expOffset + info.color];

      if (exp.length > 0 && canPlayToExpedition(topCard, exp)) {
        score = 18 + info.value;
      } else if (exp.length > 0) {
        score = 3;
      } else {
        const stats = handColorStats(s, player, info.color);
        if (stats.count >= 2 && stats.valueSum >= 12) {
          score = 4;
        } else {
          score = 1;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = draw;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// V3 heuristics (wager priority, value-scaled discards, strict draw filtering)
// ---------------------------------------------------------------------------

interface ColorDetail {
  count: number;
  numberCount: number;
  wagerCount: number;
  valueSum: number;
  hasHighCard: boolean;
}

function handColorDetail(s: FastState, player: number, color: number): ColorDetail {
  let count = 0;
  let numberCount = 0;
  let wagerCount = 0;
  let valueSum = 0;
  let hasHighCard = false;
  for (const cardId of s.hands[player]) {
    const info = CARD_INFO[cardId];
    if (info.color === color) {
      count++;
      if (info.type === 0) {
        wagerCount++;
      } else {
        numberCount++;
        valueSum += info.value;
        if (info.value >= 7) hasHighCard = true;
      }
    }
  }
  return { count, numberCount, wagerCount, valueSum, hasHighCard };
}

function pickPlayV3(s: FastState, plays: PlayActionFast[]): PlayActionFast {
  let bestScore = -Infinity;
  let best = plays[0];

  const player = s.currentPlayer;
  const expOffset = player * NUM_COLORS;
  const oppOffset = (1 - player) * NUM_COLORS;

  for (const play of plays) {
    const info = CARD_INFO[play.cardId];
    let score = 0;

    if (play.kind === 0) {
      const exp = s.expeditions[expOffset + info.color];

      if (exp.length > 0) {
        score = 25 + info.value * 2;
        if (exp.length >= 5) score += 8;
        if (exp.length >= 7) score += 15;
      } else {
        const d = handColorDetail(s, player, info.color);

        if (info.type === 0) {
          if (d.numberCount >= 2) {
            score = 18 + d.numberCount * 2;
          } else if (d.numberCount >= 1 && d.hasHighCard) {
            score = 12;
          } else {
            score = -25;
          }
        } else {
          if (d.wagerCount > 0 && d.numberCount >= 2) {
            score = 8 + info.value * 0.5;
          } else if (d.numberCount >= 3 && d.valueSum >= 15) {
            score = 6 + info.value;
          } else if (d.numberCount >= 2 && d.hasHighCard) {
            score = 3;
          } else {
            score = -12;
          }
        }
      }
    } else {
      const myExp = s.expeditions[expOffset + info.color];
      const oppExp = s.expeditions[oppOffset + info.color];

      if (myExp.length > 0 && canPlayToExpedition(play.cardId, myExp)) {
        score = -40;
      } else if (myExp.length > 0) {
        score = -12;
      } else {
        if (info.type === 0) {
          const d = handColorDetail(s, player, info.color);
          score = d.numberCount >= 2 ? -5 : 8;
        } else {
          score = 4 - info.value * 0.7;
        }
      }

      if (oppExp.length > 0) score -= 6 + info.value * 0.3;
      if (myExp.length === 0 && oppExp.length === 0) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      best = play;
    }
  }

  return best;
}

function pickDrawV3(s: FastState, draws: DrawActionFast[]): DrawActionFast {
  const player = s.currentPlayer;
  const expOffset = player * NUM_COLORS;

  let bestScore = -Infinity;
  let best = draws[0];

  for (const draw of draws) {
    let score = 0;

    if (draw.kind === 0) {
      score = 8;
    } else {
      const pile = s.discardPiles[draw.color];
      if (pile.length === 0) continue;
      const topCard = pile[pile.length - 1];
      const info = CARD_INFO[topCard];
      const exp = s.expeditions[expOffset + info.color];

      if (exp.length > 0 && canPlayToExpedition(topCard, exp)) {
        score = 20 + info.value;
      } else if (exp.length === 0 && info.type === 0) {
        const d = handColorDetail(s, player, info.color);
        score = d.numberCount >= 2 && d.valueSum >= 10 ? 12 : 0;
      } else {
        score = 0;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      best = draw;
    }
  }

  return best;
}

// ---------------------------------------------------------------------------
// Strategy definitions
// ---------------------------------------------------------------------------

export const STRATEGY_V1: AIStrategy = {
  id: "ismcts-v1",
  label: "IS-MCTS v1",
  description: "Original IS-MCTS with weak rollout heuristic. Serves as baseline for comparison.",
  pickPlay: pickPlayV1,
  pickDraw: pickDrawV1,
  mctsConfig: { iterations: 4000, explorationConstant: 1.4 },
};

export const STRATEGY_V2: AIStrategy = {
  id: "ismcts-v2",
  label: "IS-MCTS v2",
  description:
    "Improved IS-MCTS with strong rollout heuristic, reward normalization, and combined play+draw tree search.",
  pickPlay: pickPlayV2,
  pickDraw: pickDrawV2,
  mctsConfig: { iterations: 6000, explorationConstant: 0.7 },
};

export const STRATEGY_V3: AIStrategy = {
  id: "ismcts-v3",
  label: "IS-MCTS v3",
  description:
    "Rewritten heuristic: wager-first priority, value-scaled discard penalties, zero-tolerance for unplayable draws. 8000 iterations.",
  pickPlay: pickPlayV3,
  pickDraw: pickDrawV3,
  mctsConfig: { iterations: 8000, explorationConstant: 0.7 },
};

export const ALL_STRATEGIES: AIStrategy[] = [STRATEGY_V3, STRATEGY_V2, STRATEGY_V1];

export function getStrategy(id: string): AIStrategy {
  const found = ALL_STRATEGIES.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown AI strategy: ${id}`);
  return found;
}
