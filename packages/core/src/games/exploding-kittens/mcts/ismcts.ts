import { actionKey, applyAction, cloneGameState } from "../game-engine";
import { getLegalActions } from "../rules";
import type { Action, GameState } from "../types";
import { determinize, redeterminize } from "./determinize";
import { randomPolicy, rollout } from "./rollout";
import type { MCTSConfig, MCTSNode } from "./types";
import { DEFAULT_MCTS_CONFIG } from "./types";

// ── MCTS Tree Utilities ─────────────────────────────────────────────────────

function createNode(key: string, parent: MCTSNode | null): MCTSNode {
  return {
    actionKey: key,
    parent,
    children: new Map(),
    visits: 0,
    totalReward: 0,
  };
}

function ucb1(child: MCTSNode, parentVisits: number, C: number): number {
  if (child.visits === 0) return Infinity;
  return child.totalReward / child.visits + C * Math.sqrt(Math.log(parentVisits) / child.visits);
}

function selectOrExpand(
  parent: MCTSNode,
  legalActions: Action[],
  C: number,
): { node: MCTSNode; action: Action } {
  const untried = legalActions.filter((a) => !parent.children.has(actionKey(a)));

  if (untried.length > 0) {
    const action = untried[Math.floor(Math.random() * untried.length)];
    const key = actionKey(action);
    const child = createNode(key, parent);
    parent.children.set(key, child);
    return { node: child, action };
  }

  let bestUCB = -Infinity;
  let bestChild: MCTSNode | null = null;
  let bestAction: Action | null = null;

  for (const a of legalActions) {
    const key = actionKey(a);
    const child = parent.children.get(key);
    if (!child) continue;
    const u = ucb1(child, parent.visits, C);
    if (u > bestUCB) {
      bestUCB = u;
      bestChild = child;
      bestAction = a;
    }
  }

  if (!bestChild || !bestAction) {
    throw new Error("UCB1 selection found no matching child — tree is inconsistent");
  }
  return { node: bestChild, action: bestAction };
}

// ── Core IS-MCTS ────────────────────────────────────────────────────────────

function runMCTSCore(baseState: GameState, aiPlayer: number, config: MCTSConfig): Action {
  const root = createNode("root", null);
  const { iterations, explorationConstant: C } = config;

  for (let i = 0; i < iterations; i++) {
    redeterminize(baseState, aiPlayer);
    const sim = cloneGameState(baseState);

    const actions = getLegalActions(sim);
    if (actions.length === 0) break;

    const { node, action } = selectOrExpand(root, actions, C);
    applyAction(sim, action);

    const reward = rollout(sim, aiPlayer, randomPolicy);

    let n: MCTSNode | null = node;
    while (n !== null) {
      n.visits++;
      n.totalReward += reward;
      n = n.parent;
    }
  }

  let bestVisits = -1;
  let bestKey = "";
  for (const [key, child] of root.children) {
    if (child.visits > bestVisits) {
      bestVisits = child.visits;
      bestKey = key;
    }
  }

  const finalActions = getLegalActions(baseState);
  return finalActions.find((a) => actionKey(a) === bestKey) ?? finalActions[0];
}

// ── Public Entry Point ──────────────────────────────────────────────────────

/**
 * Run IS-MCTS on a GameState, returning a rich Action.
 * Works for both human-vs-AI play and AI-vs-AI tournaments.
 */
export function runISMCTS(
  gameState: GameState,
  playerIndex: number,
  config: MCTSConfig = DEFAULT_MCTS_CONFIG,
): Action {
  const baseState = determinize(gameState, playerIndex);
  return runMCTSCore(baseState, playerIndex, config);
}
