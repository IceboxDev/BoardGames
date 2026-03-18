import type { AIStrategy } from "../ai-strategies";
import type { AIMove, DrawAction, GameState, PlayAction } from "../types";
import { EXPEDITION_COLORS } from "../types";
import { determinize, redeterminize } from "./determinize";
import {
  applyDrawFast,
  applyPlayFast,
  cloneState,
  getLegalDraws,
  getLegalPlays,
} from "./fast-game";
import { rollout } from "./rollout";
import type { DrawActionFast, FastState, MCTSNode, PlayActionFast } from "./types";

const MAX_SCORE_DIFF = 200;

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
): { node: MCTSNode; action: A } {
  const untried = legalActions.filter((a) => !parent.children.has(a.key));

  if (untried.length > 0) {
    const action = untried[(Math.random() * untried.length) | 0];
    const child = createNode(action.key, parent);
    parent.children.set(action.key, child);
    return { node: child, action };
  }

  let bestUCB = -Infinity;
  let bestChild: MCTSNode | null = null;
  let bestAction: A | null = null;

  for (const a of legalActions) {
    const child = parent.children.get(a.key);
    if (!child) continue;
    const u = ucb1(child, parent.visits, C);
    if (u > bestUCB) {
      bestUCB = u;
      bestChild = child;
      bestAction = a;
    }
  }

  return { node: bestChild!, action: bestAction! };
}

// ---------------------------------------------------------------------------
// Core MCTS algorithm — single implementation used by all entry points.
// Operates entirely on FastState; callers are responsible for producing
// baseState (via determinize or cloneState) before invoking.
// ---------------------------------------------------------------------------

function runMCTSCore(
  baseState: FastState,
  player: number,
  strategy: AIStrategy,
): { play: PlayActionFast; draw: DrawActionFast } {
  const root = createNode("root", null);
  const { iterations, explorationConstant: C } = strategy.mctsConfig;

  for (let i = 0; i < iterations; i++) {
    redeterminize(baseState, player);
    const simState = cloneState(baseState);

    const legalPlays = getLegalPlays(simState);
    const { node: playNode, action: chosenPlay } = selectOrExpand(root, legalPlays, C);

    applyPlayFast(simState, chosenPlay);

    const legalDraws = getLegalDraws(simState);
    const { node: drawNode, action: chosenDraw } = selectOrExpand(playNode, legalDraws, C);

    applyDrawFast(simState, chosenDraw);

    const rawReward = rollout(simState, player, strategy.pickPlay, strategy.pickDraw);
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

  return { play: bestPlay, draw: bestDraw };
}

// ---------------------------------------------------------------------------
// Public entry points
// ---------------------------------------------------------------------------

/**
 * Run IS-MCTS for the AI player against a human.
 * Determinizes the GameState into a FastState, runs the core algorithm,
 * and converts the result back to rich action types.
 */
export function runISMCTS(gameState: GameState, strategy: AIStrategy): AIMove {
  const baseState = determinize(gameState);
  const { play, draw } = runMCTSCore(baseState, 1, strategy);

  return {
    play: fastPlayToAction(play, gameState),
    draw: fastDrawToAction(draw),
  };
}

/**
 * Run IS-MCTS directly on a FastState for any player index.
 * Used by the tournament worker for AI-vs-AI simulation.
 */
export function runMCTSFast(
  state: FastState,
  player: number,
  strategy: AIStrategy,
): { play: PlayActionFast; draw: DrawActionFast } {
  const baseState = cloneState(state);
  return runMCTSCore(baseState, player, strategy);
}

// ---------------------------------------------------------------------------
// FastAction → RichAction conversion (used only by runISMCTS)
// ---------------------------------------------------------------------------

function fastPlayToAction(fast: PlayActionFast, gameState: GameState): PlayAction {
  const card = gameState.aiHand.find((c) => c.id === fast.cardId)!;
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
