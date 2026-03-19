import { canPlayToExpedition } from "./mcts/fast-game";
import {
  CARD_INFO,
  type DrawActionFast,
  EXPEDITION_COST,
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

// ---------------------------------------------------------------------------
// V1 heuristics (original weak penalties)
// ---------------------------------------------------------------------------

function pickPlayV1(s: FastState, plays: PlayActionFast[], count: number): PlayActionFast {
  let bestScore = -Infinity;
  let best = plays[0];

  const player = s.currentPlayer;
  const expOffset = player * NUM_COLORS;
  const oppOffset = (1 - player) * NUM_COLORS;

  for (let i = 0; i < count; i++) {
    const play = plays[i];
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

function pickDrawV1(s: FastState, draws: DrawActionFast[], count: number): DrawActionFast {
  const player = s.currentPlayer;
  const expOffset = player * NUM_COLORS;

  let bestScore = -Infinity;
  let best = draws[0];

  for (let i = 0; i < count; i++) {
    const draw = draws[i];
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
// V3 heuristics (wager priority, value-scaled discards, strict draw filtering)
// ---------------------------------------------------------------------------

interface ColorDetail {
  count: number;
  numberCount: number;
  wagerCount: number;
  valueSum: number;
  hasHighCard: boolean;
}

const _colorDetailBuf: ColorDetail = {
  count: 0,
  numberCount: 0,
  wagerCount: 0,
  valueSum: 0,
  hasHighCard: false,
};

function handColorDetail(s: FastState, player: number, color: number): ColorDetail {
  const d = _colorDetailBuf;
  d.count = 0;
  d.numberCount = 0;
  d.wagerCount = 0;
  d.valueSum = 0;
  d.hasHighCard = false;
  for (const cardId of s.hands[player]) {
    const info = CARD_INFO[cardId];
    if (info.color === color) {
      d.count++;
      if (info.type === 0) {
        d.wagerCount++;
      } else {
        d.numberCount++;
        d.valueSum += info.value;
        if (info.value >= 7) d.hasHighCard = true;
      }
    }
  }
  return d;
}

function pickPlayV3(s: FastState, plays: PlayActionFast[], count: number): PlayActionFast {
  let bestScore = -Infinity;
  let best = plays[0];

  const player = s.currentPlayer;
  const expOffset = player * NUM_COLORS;
  const oppOffset = (1 - player) * NUM_COLORS;

  for (let i = 0; i < count; i++) {
    const play = plays[i];
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

function pickDrawV3(s: FastState, draws: DrawActionFast[], count: number): DrawActionFast {
  const player = s.currentPlayer;
  const expOffset = player * NUM_COLORS;

  let bestScore = -Infinity;
  let best = draws[0];

  for (let i = 0; i < count; i++) {
    const draw = draws[i];
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
// V4 heuristics (MCTS3 loss fixes: wager-first, low-first, tighter starts, opp-aware)
// ---------------------------------------------------------------------------

function pickPlayV4(s: FastState, plays: PlayActionFast[], count: number): PlayActionFast {
  let bestScore = -Infinity;
  let best = plays[0];

  const player = s.currentPlayer;
  const expOffset = player * NUM_COLORS;
  const oppOffset = (1 - player) * NUM_COLORS;

  for (let i = 0; i < count; i++) {
    const play = plays[i];
    const info = CARD_INFO[play.cardId];
    let score = 0;

    if (play.kind === 0) {
      const exp = s.expeditions[expOffset + info.color];

      if (exp.length > 0) {
        score = 25 + info.value * 2;
        if (exp.length >= 5) score += 8;
        if (exp.length >= 7) score += 15;
        if (info.type === 1) {
          let minPlayable = 11;
          for (const c of s.hands[player]) {
            const ci = CARD_INFO[c];
            if (ci.color === info.color && ci.type === 1 && canPlayToExpedition(c, exp)) {
              if (ci.value < minPlayable) minPlayable = ci.value;
            }
          }
          if (info.value === minPlayable) score += 10;
        }
      } else {
        const d = handColorDetail(s, player, info.color);

        if (info.type === 0) {
          if (d.numberCount >= 2) {
            score = 18 + d.numberCount * 2;
          } else if (d.numberCount >= 1 && d.hasHighCard) {
            score = 6;
          } else {
            score = -25;
          }
        } else {
          if (d.wagerCount > 0) score -= 35;
          if (d.wagerCount > 0 && d.numberCount >= 2) {
            score += 8 + info.value * 0.5;
          } else if (d.numberCount >= 3 && d.valueSum >= 18) {
            score += 6 + info.value;
          } else if (d.numberCount >= 3 && d.valueSum >= 15) {
            score += 6 + info.value;
            if (d.valueSum < 18) score -= 5;
          } else if (d.numberCount >= 2 && d.hasHighCard) {
            score += 3;
          } else {
            score += -12;
          }
          let startedCount = 0;
          for (let c = 0; c < NUM_COLORS; c++) {
            if (s.expeditions[expOffset + c].length > 0) startedCount++;
          }
          if (startedCount >= 3) score -= 4;
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

      if (oppExp.length > 0) {
        score -= 12 + info.value * 0.6;
        if (oppExp.length >= 2 && info.type === 1 && info.value >= 7) score -= 8;
      }
      if (myExp.length === 0 && oppExp.length === 0) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      best = play;
    }
  }

  return best;
}

function pickDrawV4(s: FastState, draws: DrawActionFast[], count: number): DrawActionFast {
  return pickDrawV3(s, draws, count);
}

// ---------------------------------------------------------------------------
// V5 heuristics (game-stage aware, conservative starts, opponent-aware discards)
// ---------------------------------------------------------------------------

const INITIAL_DRAW_PILE_SIZE = 44; // 60 cards - 16 dealt

function gameProgress(s: FastState): number {
  return 1 - s.drawPile.length / INITIAL_DRAW_PILE_SIZE;
}

function countStartedExpeditions(s: FastState, expOffset: number): number {
  let count = 0;
  for (let c = 0; c < NUM_COLORS; c++) {
    if (s.expeditions[expOffset + c].length > 0) count++;
  }
  return count;
}

function pickPlayV5(s: FastState, plays: PlayActionFast[], count: number): PlayActionFast {
  let bestScore = -Infinity;
  let best = plays[0];

  const player = s.currentPlayer;
  const expOffset = player * NUM_COLORS;
  const oppOffset = (1 - player) * NUM_COLORS;
  const progress = gameProgress(s);
  const startedCount = countStartedExpeditions(s, expOffset);

  for (let i = 0; i < count; i++) {
    const play = plays[i];
    const info = CARD_INFO[play.cardId];
    let score = 0;

    if (play.kind === 0) {
      // --- Play to expedition ---
      const exp = s.expeditions[expOffset + info.color];

      if (exp.length > 0) {
        // Extending an existing expedition
        score = 25 + info.value * 2;
        if (exp.length >= 5) score += 8;
        if (exp.length >= 7) score += 15;

        if (info.type === 1) {
          let minPlayable = 11;
          for (const c of s.hands[player]) {
            const ci = CARD_INFO[c];
            if (ci.color === info.color && ci.type === 1 && canPlayToExpedition(c, exp)) {
              if (ci.value < minPlayable) minPlayable = ci.value;
            }
          }
          if (info.value === minPlayable) {
            score += 10;
          } else {
            score -= 25;
          }
        } else {
          // Wager on existing all-wager expedition: model the extra -20 multiplier cost
          const d = handColorDetail(s, player, info.color);
          const estimatedValue = (d.valueSum - EXPEDITION_COST) * (exp.length + 1);
          if (estimatedValue < -30) score -= 15;
        }

        // Late-game bonus for approaching length bonus
        if (progress > 0.5 && exp.length >= 6) score += 10;
      } else {
        // Starting a new expedition
        const d = handColorDetail(s, player, info.color);

        // Late-game penalty: new expeditions unlikely to become profitable
        const latePenalty = progress > 0.6 ? -15 * progress : 0;
        // Expedition count penalty: applies to both wagers and numbers
        const startPenalty = -6 * Math.max(0, startedCount - 2);

        if (info.type === 0) {
          // Wager start: estimate final value with all support in hand
          const estimatedFinal = (d.valueSum - EXPEDITION_COST) * (1 + d.wagerCount);
          if (d.numberCount >= 3 && d.valueSum >= 15 && estimatedFinal > -10) {
            score = 12 + d.numberCount * 2;
          } else if (d.numberCount >= 2 && d.valueSum >= 12) {
            score = 4;
          } else {
            score = -30;
          }
          score += startPenalty + latePenalty;
        } else {
          // Number start
          if (d.wagerCount > 0 && d.numberCount >= 3 && d.valueSum >= 20) {
            // Strong support with wagers: defer to wager-first
            score = -20;
          } else if (d.numberCount >= 3 && d.valueSum >= 18) {
            score = 6 + info.value;
          } else if (d.numberCount >= 3 && d.valueSum >= 15) {
            score = 3 + info.value;
          } else if (d.numberCount >= 2 && d.hasHighCard) {
            score = 1;
          } else {
            score = -12;
          }

          // Profitability gate: penalize if hand cards alone can't cover expedition cost
          let playableSum = 0;
          for (const c of s.hands[player]) {
            const ci = CARD_INFO[c];
            if (ci.color === info.color && ci.type === 1 && ci.value >= info.value) {
              playableSum += ci.value;
            }
          }
          if (playableSum < EXPEDITION_COST) {
            score -= (EXPEDITION_COST - playableSum) * 3;
          }

          // Low-first bonus for new expedition starts
          let minNumber = 11;
          for (const c of s.hands[player]) {
            const ci = CARD_INFO[c];
            if (ci.color === info.color && ci.type === 1) {
              if (ci.value < minNumber) minNumber = ci.value;
            }
          }
          if (info.value === minNumber && info.value <= 5) score += 4;

          score += startPenalty + latePenalty;
        }
      }
    } else {
      // --- Discard ---
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

          let minVal = 11;
          let higherCount = 0;
          for (const c of s.hands[player]) {
            const ci = CARD_INFO[c];
            if (ci.color === info.color && ci.type === 1) {
              if (ci.value < minVal) minVal = ci.value;
              if (ci.value > info.value) higherCount++;
            }
          }
          if (higherCount >= 1 && info.value === minVal) {
            const d = handColorDetail(s, player, info.color);
            if (d.numberCount >= 2 && d.valueSum >= 12) {
              score -= 6 + higherCount * 2;
            }
          }
        }
      }

      // Opponent-aware discard penalties (scaled by opponent wager multiplier)
      if (oppExp.length > 0) {
        let oppWagers = 0;
        for (const c of oppExp) {
          if (CARD_INFO[c].type === 0) oppWagers++;
        }
        const oppMult = 1 + oppWagers;

        if (canPlayToExpedition(play.cardId, oppExp)) {
          score -= (20 + info.value) * oppMult;
        } else {
          score -= 12 + info.value * 0.6;
        }
        if (oppExp.length >= 2 && info.type === 1 && info.value >= 7) score -= 8 * oppMult;
      }

      // Safety: discarding on lastDiscardedColor is safer (opponent can't draw it)
      if (info.color === s.lastDiscardedColor) score += 4;

      if (myExp.length === 0 && oppExp.length === 0) score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      best = play;
    }
  }

  return best;
}

function pickDrawV5(s: FastState, draws: DrawActionFast[], count: number): DrawActionFast {
  const player = s.currentPlayer;
  const expOffset = player * NUM_COLORS;
  const oppOffset = (1 - player) * NUM_COLORS;
  const progress = gameProgress(s);

  let bestScore = -Infinity;
  let best = draws[0];

  // Draw pile base score scales with game stage
  const drawPileBase = 10 - 4 * progress; // 10 early, 6 late

  for (let i = 0; i < count; i++) {
    const draw = draws[i];
    let score = 0;

    if (draw.kind === 0) {
      score = drawPileBase;
    } else {
      const pile = s.discardPiles[draw.color];
      if (pile.length === 0) continue;
      const topCard = pile[pile.length - 1];
      const info = CARD_INFO[topCard];
      const exp = s.expeditions[expOffset + info.color];

      const canUse = exp.length === 0 || canPlayToExpedition(topCard, exp);

      if (exp.length > 0 && canPlayToExpedition(topCard, exp)) {
        score = 20 + info.value;
      } else if (exp.length === 0 && info.type === 0) {
        const d = handColorDetail(s, player, info.color);
        score = d.numberCount >= 2 && d.valueSum >= 10 ? 12 : -2;
      } else {
        score = -8;
      }

      const oppExp = s.expeditions[oppOffset + info.color];
      if (oppExp.length > 0 && canPlayToExpedition(topCard, oppExp)) {
        if (canUse) {
          score += 8 + info.value * 0.3;
        } else {
          let oppWagers = 0;
          for (const c of oppExp) {
            if (CARD_INFO[c].type === 0) oppWagers++;
          }
          const denialValue = info.value * (1 + oppWagers);
          score = Math.max(score, -3 + denialValue * 0.7);
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
// Strategy definitions
// ---------------------------------------------------------------------------

export const STRATEGY_V1: AIStrategy = {
  id: "ismcts-v1",
  label: "Baseline",
  description: "Baseline MCTS with weak rollout heuristic. 4k iterations.",
  pickPlay: pickPlayV1,
  pickDraw: pickDrawV1,
  mctsConfig: { iterations: 4000, explorationConstant: 1.4 },
};

export const STRATEGY_V3: AIStrategy = {
  id: "ismcts-v3",
  label: "Wager-First",
  description:
    "Wager-first priority, value-scaled discards, zero-tolerance for unplayable draws. 8k iterations.",
  pickPlay: pickPlayV3,
  pickDraw: pickDrawV3,
  mctsConfig: { iterations: 8000, explorationConstant: 0.7 },
};

export const STRATEGY_V4: AIStrategy = {
  id: "ismcts-v4",
  label: "Strict",
  description:
    "Strict tree filters, wager-first, low-first ordering, tighter expedition starts, opponent-aware discards. 8k iterations.",
  pickPlay: pickPlayV4,
  pickDraw: pickDrawV4,
  mctsConfig: { iterations: 8000, explorationConstant: 0.7, useStrictFilters: true },
};

export const STRATEGY_V5: AIStrategy = {
  id: "ismcts-v5",
  label: "Adaptive",
  description:
    "Game-stage aware rollout, conservative starts, opponent-aware discards, known-card pinning. 16k iterations.",
  pickPlay: pickPlayV5,
  pickDraw: pickDrawV5,
  mctsConfig: { iterations: 16000, explorationConstant: 0.7, useSoftDrawFilter: true },
};

export const ALL_STRATEGIES: AIStrategy[] = [STRATEGY_V5, STRATEGY_V4, STRATEGY_V3, STRATEGY_V1];

export function getStrategy(id: string): AIStrategy {
  const found = ALL_STRATEGIES.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown AI strategy: ${id}`);
  return found;
}
