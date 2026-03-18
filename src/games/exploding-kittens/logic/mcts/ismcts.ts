import { getLegalActions } from "../rules";
import type { Action, GameState } from "../types";
import { determinize, redeterminize } from "./determinize";
import { applyActionFast, cloneFastState, getLegalActionsFast } from "./fast-game";
import { randomPolicy, rollout } from "./rollout";
import type { FastAction, FastState, MCTSConfig, MCTSNode } from "./types";
import { DEFAULT_MCTS_CONFIG } from "./types";

// ── MCTS Tree Utilities ─────────────────────────────────────────────────────

function createNode(actionKey: string, parent: MCTSNode | null): MCTSNode {
  return {
    actionKey,
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
  legalActions: FastAction[],
  C: number,
): { node: MCTSNode; action: FastAction } {
  const untried = legalActions.filter((a) => !parent.children.has(a.key));

  if (untried.length > 0) {
    const action = untried[Math.floor(Math.random() * untried.length)];
    const child = createNode(action.key, parent);
    parent.children.set(action.key, child);
    return { node: child, action };
  }

  let bestUCB = -Infinity;
  let bestChild: MCTSNode | null = null;
  let bestAction: FastAction | null = null;

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

// ── Core IS-MCTS ────────────────────────────────────────────────────────────

function runMCTSCore(baseState: FastState, aiPlayer: number, config: MCTSConfig): FastAction {
  const root = createNode("root", null);
  const { iterations, explorationConstant: C } = config;

  for (let i = 0; i < iterations; i++) {
    redeterminize(baseState, aiPlayer);
    const sim = cloneFastState(baseState);

    const actions = getLegalActionsFast(sim);
    if (actions.length === 0) break;

    const { node, action } = selectOrExpand(root, actions, C);
    applyActionFast(sim, action);

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

  const finalActions = getLegalActionsFast(baseState);
  return finalActions.find((a) => a.key === bestKey) ?? finalActions[0];
}

// ── Public Entry Points ─────────────────────────────────────────────────────

/**
 * Run IS-MCTS on a GameState, returning a rich Action.
 * Used by the AI worker for human-vs-AI play.
 */
export function runISMCTS(
  gameState: GameState,
  playerIndex: number,
  config: MCTSConfig = DEFAULT_MCTS_CONFIG,
): Action {
  const baseState = determinize(gameState, playerIndex);
  const fastAction = runMCTSCore(baseState, playerIndex, config);
  return fastActionToAction(fastAction, gameState);
}

/**
 * Run IS-MCTS directly on a FastState.
 * Used by the tournament worker for AI-vs-AI simulation.
 */
export function runMCTSFast(
  state: FastState,
  playerIndex: number,
  config: MCTSConfig = DEFAULT_MCTS_CONFIG,
): FastAction {
  const base = cloneFastState(state);
  return runMCTSCore(base, playerIndex, config);
}

// ── Conversion ──────────────────────────────────────────────────────────────

function fastActionToAction(fast: FastAction, state: GameState): Action {
  const legal = getLegalActions(state);

  switch (fast.kind) {
    case 0: // ACT_PLAY_CARD
      return legal.find((a) => a.type === "play-card" && a.cardId === fast.cardId) ?? legal[0];
    case 12: // ACT_PLAY_COMBO
      return (
        legal.find(
          (a) =>
            a.type === "play-combo" &&
            a.cardIds.length === fast.cardIds.length &&
            a.cardIds.every((id) => fast.cardIds.includes(id)),
        ) ?? legal[0]
      );
    case 1: // ACT_END_ACTION
      return legal.find((a) => a.type === "end-action-phase") ?? legal[0];
    case 2: // ACT_NOPE
      return legal.find((a) => a.type === "nope" && a.cardId === fast.cardId) ?? legal[0];
    case 3: // ACT_PASS_NOPE
      return legal.find((a) => a.type === "pass-nope") ?? legal[0];
    case 4: // ACT_SELECT_TARGET
      return (
        legal.find((a) => a.type === "select-target" && a.targetIndex === fast.targetIndex) ??
        legal[0]
      );
    case 5: // ACT_GIVE_CARD
      return legal.find((a) => a.type === "give-card" && a.cardId === fast.cardId) ?? legal[0];
    case 6: // ACT_NAME_TYPE
      return legal.find((a) => a.type === "name-card-type") ?? legal[0];
    case 7: // ACT_SELECT_DISCARD
      return (
        legal.find((a) => a.type === "select-discard-card" && a.cardId === fast.cardId) ?? legal[0]
      );
    case 8: // ACT_ACK_PEEK
      return legal.find((a) => a.type === "acknowledge-peek") ?? legal[0];
    case 9: // ACT_DEFUSE
      return legal.find((a) => a.type === "play-defuse" && a.cardId === fast.cardId) ?? legal[0];
    case 10: // ACT_REINSERT
      return (
        legal.find((a) => a.type === "reinsert-kitten" && a.position === fast.position) ?? legal[0]
      );
    case 11: // ACT_SKIP_DEFUSE
      return legal.find((a) => a.type === "skip-defuse") ?? legal[0];
    default:
      return legal[0];
  }
}
