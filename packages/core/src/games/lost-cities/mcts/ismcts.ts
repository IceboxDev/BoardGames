import type { AIStrategy } from "../ai-strategies";
import type { AIMove, DrawAction, GameState, PlayAction, PlayerIndex } from "../types";
import { EXPEDITION_COLORS } from "../types";
import { determinize, redeterminize } from "./determinize";
import {
  applyDrawFast,
  applyPlayFast,
  canPlayToExpedition,
  cloneState,
  getLegalDraws,
  getLegalPlays,
} from "./fast-game";
import { rollout } from "./rollout";
import type { DrawActionFast, FastState, MCTSNode, PlayActionFast } from "./types";
import { CARD_INFO, NUM_COLORS } from "./types";

const MAX_SCORE_DIFF = 200;

export interface MCTSStats {
  playActions: {
    key: string;
    cardId: number;
    kind: number;
    visits: number;
    /** Mean UCB backup reward in [0,1] after normalizing score differential — not P(win). */
    meanNormalizedReward: number;
  }[];
  drawActions: {
    key: string;
    kind: number;
    color: number;
    visits: number;
    meanNormalizedReward: number;
  }[];
  chosenPlayKey: string;
  chosenDrawKey: string;
}

function createNode(actionKey: string, parent: MCTSNode | null): MCTSNode {
  return {
    actionKey,
    parent,
    children: new Map(),
    visits: 0,
    totalReward: 0,
  };
}

function normalizeReward(raw: number): number {
  const n = (raw + MAX_SCORE_DIFF) / (2 * MAX_SCORE_DIFF);
  return Math.max(0, Math.min(1, n));
}

function ucb1(child: MCTSNode, parentVisits: number, C: number): number {
  if (child.visits === 0) return Infinity;
  return child.totalReward / child.visits + C * Math.sqrt(Math.log(parentVisits) / child.visits);
}

function selectOrExpand<A extends { key: string }>(
  parent: MCTSNode,
  legalActions: A[],
  C: number,
  actionCount?: number,
): { node: MCTSNode; action: A } {
  const len = actionCount ?? legalActions.length;

  // Single pass: count untried, find best UCB, and reservoir-sample an untried action
  let untriedCount = 0;
  let sampledUntried: A | null = null;
  let bestUCB = -Infinity;
  let bestChild: MCTSNode | null = null;
  let bestAction: A | null = null;

  for (let i = 0; i < len; i++) {
    const a = legalActions[i];
    const child = parent.children.get(a.key);
    if (!child) {
      untriedCount++;
      if (Math.random() * untriedCount < 1) {
        sampledUntried = a;
      }
    } else {
      const u = ucb1(child, parent.visits, C);
      if (u > bestUCB) {
        bestUCB = u;
        bestChild = child;
        bestAction = a;
      }
    }
  }

  if (sampledUntried !== null) {
    const child = createNode(sampledUntried.key, parent);
    parent.children.set(sampledUntried.key, child);
    return { node: child, action: sampledUntried };
  }

  if (!bestChild || !bestAction) throw new Error("No legal actions available for selection");
  return { node: bestChild, action: bestAction };
}

function filterPlayableDiscards(s: FastState, plays: PlayActionFast[]): PlayActionFast[] {
  const player = s.currentPlayer;
  const expOffset = player * NUM_COLORS;
  const hasExpeditionPlay = new Set<number>();
  for (const p of plays) {
    if (p.kind === 0) {
      hasExpeditionPlay.add(p.cardId);
    }
  }
  return plays.filter((p) => {
    if (p.kind !== 1) return true;
    if (hasExpeditionPlay.has(p.cardId)) return false;
    const info = CARD_INFO[p.cardId];
    const exp = s.expeditions[expOffset + info.color];
    return !canPlayToExpedition(p.cardId, exp);
  });
}

function filterUnplayableDiscardDraws(s: FastState, draws: DrawActionFast[]): DrawActionFast[] {
  const hasPile = draws.some((d) => d.kind === 0);
  if (!hasPile) return draws;
  const player = s.currentPlayer;
  const expOffset = player * NUM_COLORS;
  return draws.filter((d) => {
    if (d.kind === 0) return true;
    const pile = s.discardPiles[d.color];
    if (pile.length === 0) return true;
    const topCard = pile[pile.length - 1];
    const info = CARD_INFO[topCard];
    const exp = s.expeditions[expOffset + info.color];
    const playable = exp.length === 0 || canPlayToExpedition(topCard, exp);
    return playable;
  });
}

function filterDangerousDiscards(s: FastState, plays: PlayActionFast[]): PlayActionFast[] {
  const player = s.currentPlayer;
  const expOffset = player * NUM_COLORS;
  const oppOffset = (1 - player) * NUM_COLORS;

  const filtered = plays.filter((p) => {
    if (p.kind !== 1) return true;
    const info = CARD_INFO[p.cardId];
    const ownExp = s.expeditions[expOffset + info.color];
    if (ownExp.length > 0 && canPlayToExpedition(p.cardId, ownExp)) return false;
    const oppExp = s.expeditions[oppOffset + info.color];
    if (oppExp.length > 0 && canPlayToExpedition(p.cardId, oppExp)) return false;
    return true;
  });

  return filtered.some((p) => p.kind === 1) ? filtered : plays;
}

// ---------------------------------------------------------------------------
// Core MCTS algorithm — single implementation used by all entry points.
// Operates entirely on FastState; callers are responsible for producing
// baseState (via determinize or cloneState) before invoking.
// ---------------------------------------------------------------------------

function runMCTSCoreWithStats(
  baseState: FastState,
  player: number,
  strategy: AIStrategy,
): { play: PlayActionFast; draw: DrawActionFast; stats: MCTSStats } {
  const root = createNode("root", null);
  const { iterations, explorationConstant: C } = strategy.mctsConfig;

  for (let i = 0; i < iterations; i++) {
    redeterminize(baseState, player);
    const simState = cloneState(baseState);

    let legalPlays = getLegalPlays(simState);
    if (strategy.mctsConfig.useStrictFilters) {
      legalPlays = filterPlayableDiscards(simState, legalPlays);
    } else {
      legalPlays = filterDangerousDiscards(simState, legalPlays);
    }
    const { node: playNode, action: chosenPlay } = selectOrExpand(root, legalPlays, C);

    applyPlayFast(simState, chosenPlay);

    let legalDraws = getLegalDraws(simState);
    if (strategy.mctsConfig.useStrictFilters) {
      legalDraws = filterUnplayableDiscardDraws(simState, legalDraws);
    } else if (strategy.mctsConfig.useSoftDrawFilter) {
      legalDraws = filterUnplayableDiscardDraws(simState, legalDraws);
    }
    const { node: drawNode, action: chosenDraw } = selectOrExpand(playNode, legalDraws, C);

    applyDrawFast(simState, chosenDraw);

    const rawReward = rollout(simState, player, strategy.pickPlay, strategy.pickDraw, {
      terminalUnplayedPenaltyPerCard: strategy.mctsConfig.terminalUnplayedPenaltyPerCard,
      terminalStrandedPenaltyPerCard: strategy.mctsConfig.terminalStrandedPenaltyPerCard,
    });
    const reward = normalizeReward(rawReward);

    let n: MCTSNode | null = drawNode;
    while (n !== null) {
      n.visits++;
      n.totalReward += reward;
      n = n.parent;
    }
  }

  let bestPlayVisits = -1;
  let bestPlayKey = "";
  let bestPlayNode: MCTSNode | null = null;

  for (const [key, child] of root.children) {
    if (child.visits > bestPlayVisits) {
      bestPlayVisits = child.visits;
      bestPlayKey = key;
      bestPlayNode = child;
    }
  }

  let bestDrawKey = "";
  if (bestPlayNode) {
    let bestDrawVisits = -1;
    for (const [key, child] of bestPlayNode.children) {
      if (child.visits > bestDrawVisits) {
        bestDrawVisits = child.visits;
        bestDrawKey = key;
      }
    }
  }

  const finalPlays = getLegalPlays(baseState);
  const bestPlay = finalPlays.find((a) => a.key === bestPlayKey) ?? finalPlays[0];

  const drawState = cloneState(baseState);
  applyPlayFast(drawState, bestPlay);
  const finalDraws = getLegalDraws(drawState);
  const bestDraw = finalDraws.find((a) => a.key === bestDrawKey) ?? finalDraws[0];

  // Build MCTS stats for replay logging (one row per semantic key — duplicate cardIds share tree stats)
  const seenPlayKeys = new Set<string>();
  const playActions = finalPlays
    .filter((a) => {
      if (seenPlayKeys.has(a.key)) return false;
      seenPlayKeys.add(a.key);
      return true;
    })
    .map((a) => {
      const child = root.children.get(a.key);
      const visits = child?.visits ?? 0;
      const meanNormalizedReward = visits > 0 ? (child?.totalReward ?? 0) / visits : 0;
      return {
        key: a.key,
        cardId: a.cardId,
        kind: a.kind,
        visits,
        meanNormalizedReward,
      };
    });

  const drawActions = finalDraws.map((a) => {
    const child = bestPlayNode?.children.get(a.key);
    const visits = child?.visits ?? 0;
    const meanNormalizedReward = visits > 0 ? (child?.totalReward ?? 0) / visits : 0;
    return {
      key: a.key,
      kind: a.kind,
      color: a.kind === 0 ? -1 : a.color,
      visits,
      meanNormalizedReward,
    };
  });

  const stats: MCTSStats = {
    playActions,
    drawActions,
    chosenPlayKey: bestPlayKey,
    chosenDrawKey: bestDrawKey,
  };

  return { play: bestPlay, draw: bestDraw, stats };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Run IS-MCTS for the given player. Determinizes the GameState into a
 * FastState, runs the core algorithm, and converts the result back to
 * rich action types.
 */
export function runISMCTS(gameState: GameState, player: PlayerIndex, strategy: AIStrategy): AIMove {
  const { move } = runISMCTSWithStats(gameState, player, strategy);
  return move;
}

/**
 * Same as runISMCTS but returns MCTS stats for replay logging.
 */
export function runISMCTSWithStats(
  gameState: GameState,
  player: PlayerIndex,
  strategy: AIStrategy,
): { move: AIMove; stats: MCTSStats } {
  const baseState = determinize(gameState, player);
  const { play, draw, stats } = runMCTSCoreWithStats(baseState, player, strategy);
  return {
    move: {
      play: fastPlayToAction(play, gameState, player),
      draw: fastDrawToAction(draw),
    },
    stats,
  };
}

// ---------------------------------------------------------------------------
// FastAction → RichAction conversion
// ---------------------------------------------------------------------------

function fastPlayToAction(
  fast: PlayActionFast,
  gameState: GameState,
  player: PlayerIndex,
): PlayAction {
  const card = gameState.hands[player].find((c) => c.id === fast.cardId);
  if (!card) throw new Error(`Card id=${fast.cardId} not found in player ${player}'s hand`);
  if (fast.kind === 0) {
    return { kind: "expedition", card };
  }
  return { kind: "discard", card };
}

function fastDrawToAction(fast: DrawActionFast): DrawAction {
  if (fast.kind === 0) {
    return { kind: "draw-pile" };
  }
  return { kind: "discard-pile", color: EXPEDITION_COLORS[fast.color] };
}
