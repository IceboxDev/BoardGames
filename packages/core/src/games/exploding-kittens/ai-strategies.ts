import type { Action, AIStrategy, AIStrategyId, Card, CardType, GameState } from "./types";
import { isCatCard } from "./types";

// ── Random Strategy ─────────────────────────────────────────────────────────

function pickRandom(_state: GameState, legalActions: Action[], _playerIndex: number): Action {
  return legalActions[Math.floor(Math.random() * legalActions.length)];
}

export const STRATEGY_RANDOM: AIStrategy = {
  id: "random",
  label: "Random",
  description: "Picks uniformly from legal actions. Baseline for comparison.",
  pickAction: pickRandom,
};

// ── Heuristic V1 Strategy ───────────────────────────────────────────────────

function pickHeuristicV1(state: GameState, legalActions: Action[], playerIndex: number): Action {
  // Phase-specific logic
  if (state.phase === "nope-window") {
    return heuristicNopeDecision(state, legalActions, playerIndex);
  }

  if (state.phase === "exploding") {
    const defuse = legalActions.find((a) => a.type === "play-defuse");
    return defuse ?? legalActions[0];
  }

  if (state.phase === "reinserting") {
    const deckSize = state.drawPile.length;
    const bottomish = Math.max(0, deckSize - Math.floor(Math.random() * 3));
    const reinsert = legalActions.find(
      (a) => a.type === "reinsert-kitten" && a.position === bottomish,
    );
    return reinsert ?? legalActions[legalActions.length - 1];
  }

  if (state.phase === "resolving-favor") {
    return heuristicFavorGive(state, legalActions, playerIndex);
  }

  if (state.phase === "choosing-target") {
    return heuristicPickTarget(state, legalActions, playerIndex);
  }

  if (state.phase === "choosing-card-name") {
    return heuristicNameCard(legalActions);
  }

  if (state.phase === "choosing-discard") {
    return heuristicPickDiscard(state, legalActions);
  }

  if (state.phase === "peeking") {
    return { type: "acknowledge-peek" };
  }

  // Action phase
  return heuristicActionPhase(state, legalActions, playerIndex);
}

function heuristicActionPhase(
  state: GameState,
  legalActions: Action[],
  playerIndex: number,
): Action {
  const player = state.players[playerIndex];
  const handSize = player.hand.length;
  const defuseCount = player.hand.filter((c) => c.type === "defuse").length;

  const combos = legalActions.filter((a) => a.type === "play-combo");
  if (combos.length > 0 && handSize > 4) {
    return combos[0];
  }

  const attacks = legalActions.filter(
    (a) => a.type === "play-card" && player.hand.find((c) => c.id === a.cardId)?.type === "attack",
  );
  if (attacks.length > 0 && defuseCount === 0 && handSize <= 3) {
    return attacks[0];
  }

  const skips = legalActions.filter(
    (a) => a.type === "play-card" && player.hand.find((c) => c.id === a.cardId)?.type === "skip",
  );
  if (skips.length > 0 && defuseCount === 0 && handSize <= 2) {
    return skips[0];
  }

  const seeTheFuture = legalActions.filter(
    (a) =>
      a.type === "play-card" &&
      player.hand.find((c) => c.id === a.cardId)?.type === "see-the-future",
  );
  if (seeTheFuture.length > 0 && Math.random() < 0.3) {
    return seeTheFuture[0];
  }

  const shuffleCards = legalActions.filter(
    (a) => a.type === "play-card" && player.hand.find((c) => c.id === a.cardId)?.type === "shuffle",
  );
  if (
    shuffleCards.length > 0 &&
    state.peekContext === null &&
    state.drawPile.length <= 5 &&
    Math.random() < 0.4
  ) {
    return shuffleCards[0];
  }

  const drawAction = legalActions.find((a) => a.type === "end-action-phase");
  return drawAction ?? legalActions[0];
}

function heuristicNopeDecision(
  state: GameState,
  legalActions: Action[],
  playerIndex: number,
): Action {
  const nw = state.nopeWindow!;
  const pass = legalActions.find((a) => a.type === "pass-nope")!;
  const nope = legalActions.find((a) => a.type === "nope");

  if (!nope) return pass;

  if (nw.sourcePlayerIndex === playerIndex) {
    return nw.nopeChain.length % 2 === 1 ? nope : pass;
  }

  if (nw.effectType === "attack" || nw.effectType === "favor") {
    const isTargetingMe = nw.sourcePlayerIndex !== playerIndex;
    if (isTargetingMe && Math.random() < 0.6) return nope;
  }

  if (nw.effectType === "pair" || nw.effectType === "triple") {
    if (Math.random() < 0.3) return nope;
  }

  return pass;
}

function heuristicFavorGive(
  _state: GameState,
  legalActions: Action[],
  _playerIndex: number,
): Action {
  const giveActions = legalActions.filter(
    (a): a is Action & { type: "give-card" } => a.type === "give-card",
  );

  const targetPlayer = _state.favorContext?.targetPlayer;
  if (targetPlayer === undefined) return giveActions[0];

  const catGive = giveActions.find((a) => {
    const card = _state.players[targetPlayer].hand.find((c: Card) => c.id === a.cardId);
    return card && isCatCard(card.type);
  });
  if (catGive) return catGive;

  return giveActions[Math.floor(Math.random() * giveActions.length)];
}

function heuristicPickTarget(
  state: GameState,
  legalActions: Action[],
  _playerIndex: number,
): Action {
  const targets = legalActions.filter(
    (a): a is Action & { type: "select-target" } => a.type === "select-target",
  );

  const richest = targets.reduce((best, t) => {
    const bHand = state.players[best.targetIndex].hand.length;
    const tHand = state.players[t.targetIndex].hand.length;
    return tHand > bHand ? t : best;
  });

  return richest;
}

function heuristicNameCard(legalActions: Action[]): Action {
  const priority: CardType[] = [
    "defuse",
    "nope",
    "attack",
    "skip",
    "see-the-future",
    "shuffle",
    "favor",
  ];

  for (const ct of priority) {
    const match = legalActions.find((a) => a.type === "name-card-type" && a.cardType === ct);
    if (match) return match;
  }

  return legalActions[0];
}

function heuristicPickDiscard(state: GameState, legalActions: Action[]): Action {
  const priority: CardType[] = ["defuse", "nope", "attack", "skip"];
  for (const ct of priority) {
    const match = legalActions.find((a) => {
      if (a.type !== "select-discard-card") return false;
      const card = state.discardPile.find((c) => c.id === a.cardId);
      return card?.type === ct;
    });
    if (match) return match;
  }
  return legalActions[0];
}

export const STRATEGY_HEURISTIC_V1: AIStrategy = {
  id: "heuristic-v1",
  label: "Heuristic v1",
  description:
    "Hand-coded priorities: conserve defuses, strategic noping, steal from leaders, reinsert kitten deep.",
  pickAction: pickHeuristicV1,
};

// ── IS-MCTS V1 Strategy ─────────────────────────────────────────────────────

export const STRATEGY_ISMCTS_V1: AIStrategy = {
  id: "ismcts-v1",
  label: "IS-MCTS v1",
  description:
    "Information Set MCTS with determinization for hidden information. Full tree search.",
  pickAction: pickHeuristicV1,
  mctsConfig: { iterations: 2000, explorationConstant: 1.0 },
};

// ── All Strategies ──────────────────────────────────────────────────────────

export const ALL_STRATEGIES: AIStrategy[] = [
  STRATEGY_ISMCTS_V1,
  STRATEGY_HEURISTIC_V1,
  STRATEGY_RANDOM,
];

export function getStrategy(id: AIStrategyId): AIStrategy {
  const found = ALL_STRATEGIES.find((s) => s.id === id);
  if (!found) return STRATEGY_RANDOM;
  return found;
}
