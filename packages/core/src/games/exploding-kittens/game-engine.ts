import { dealGame, shuffleInPlace } from "./deck";
import type { Rng } from "./rng";
import type {
  Action,
  AIStrategyId,
  Card,
  CardType,
  GameState,
  PlayerState,
  PlayerType,
} from "./types";

// Module-scoped active RNG — set by applyAction, used by internal helpers.
// Safe in single-threaded JS; avoids threading rng through ~7 internal signatures.
let activeRng: Rng = Math.random;

// ── State Creation ──────────────────────────────────────────────────────────

export function createInitialState(
  playerCount: number,
  strategies: (AIStrategyId | null)[],
  rng: Rng = Math.random,
): GameState {
  const deal = dealGame(playerCount, rng);

  const players: PlayerState[] = deal.players.map((p, i) => ({
    index: i,
    type: (strategies[i] === null ? "human" : "ai") as PlayerType,
    hand: p.hand,
    alive: true,
    aiStrategy: strategies[i] ?? undefined,
  }));

  return {
    phase: "action-phase",
    drawPile: deal.drawPile,
    discardPile: [],
    players,
    currentPlayerIndex: 0,
    turnsRemaining: 1,
    turnCount: 1,
    nopeWindow: null,
    favorContext: null,
    stealContext: null,
    discardPickContext: null,
    peekContext: null,
    explosionContext: null,
    actionLog: [],
    winner: null,
  };
}

// ── Clone ───────────────────────────────────────────────────────────────────

export function cloneGameState(state: GameState): GameState {
  return {
    phase: state.phase,
    drawPile: state.drawPile.slice(),
    discardPile: state.discardPile.slice(),
    players: state.players.map((p) => ({
      index: p.index,
      type: p.type,
      hand: p.hand.slice(),
      alive: p.alive,
      aiStrategy: p.aiStrategy,
    })),
    currentPlayerIndex: state.currentPlayerIndex,
    turnsRemaining: state.turnsRemaining,
    turnCount: state.turnCount,
    nopeWindow: state.nopeWindow
      ? {
          pendingAction: state.nopeWindow.pendingAction,
          pendingCardIds: state.nopeWindow.pendingCardIds.slice(),
          sourcePlayerIndex: state.nopeWindow.sourcePlayerIndex,
          effectType: state.nopeWindow.effectType,
          nopeChain: state.nopeWindow.nopeChain.slice(),
          currentPollingIndex: state.nopeWindow.currentPollingIndex,
          passedPlayerIndices: state.nopeWindow.passedPlayerIndices.slice(),
        }
      : null,
    favorContext: state.favorContext ? { ...state.favorContext } : null,
    stealContext: state.stealContext ? { ...state.stealContext } : null,
    discardPickContext: state.discardPickContext ? { ...state.discardPickContext } : null,
    peekContext: state.peekContext
      ? {
          playerIndex: state.peekContext.playerIndex,
          cards: state.peekContext.cards.slice(),
        }
      : null,
    explosionContext: state.explosionContext ? { ...state.explosionContext } : null,
    actionLog: state.actionLog?.slice(),
    winner: state.winner,
  };
}

// ── Action Key (for MCTS tree identification) ───────────────────────────────

export function actionKey(action: Action): string {
  switch (action.type) {
    case "play-card":
      return `pc:${action.cardId}`;
    case "play-combo":
      return `co:${action.cardIds.join(":")}`;
    case "end-action-phase":
      return "end";
    case "nope":
      return `nope:${action.cardId}`;
    case "pass-nope":
      return "pass";
    case "select-target":
      return `t:${action.targetIndex}`;
    case "give-card":
      return `give:${action.cardId}`;
    case "name-card-type":
      return `name:${action.cardType}`;
    case "select-discard-card":
      return `dpick:${action.cardId}`;
    case "acknowledge-peek":
      return "ack";
    case "play-defuse":
      return `defuse:${action.cardId}`;
    case "reinsert-kitten":
      return `ri:${action.position}`;
    case "skip-defuse":
      return "die";
  }
}

// ── Main Dispatch (Mutable) ─────────────────────────────────────────────────

export function applyAction(state: GameState, action: Action, rng: Rng = Math.random): void {
  activeRng = rng;
  switch (action.type) {
    case "play-card":
      handlePlayCard(state, action.cardId);
      break;
    case "play-combo":
      handlePlayCombo(state, action.cardIds);
      break;
    case "end-action-phase":
      handleEndActionPhase(state);
      break;
    case "nope":
      handleNope(state, action.cardId);
      break;
    case "pass-nope":
      handlePassNope(state);
      break;
    case "select-target":
      handleSelectTarget(state, action.targetIndex, rng);
      break;
    case "give-card":
      handleGiveCard(state, action.cardId);
      break;
    case "name-card-type":
      handleNameCardType(state, action.cardType);
      break;
    case "select-discard-card":
      handleSelectDiscardCard(state, action.cardId);
      break;
    case "acknowledge-peek":
      handleAcknowledgePeek(state);
      break;
    case "play-defuse":
      handlePlayDefuse(state, action.cardId);
      break;
    case "reinsert-kitten":
      handleReinsertKitten(state, action.position);
      break;
    case "skip-defuse":
      handleSkipDefuse(state);
      break;
  }
}

/** Immutable convenience wrapper — clones first, then applies. */
export function applyActionPure(
  state: GameState,
  action: Action,
  rng: Rng = Math.random,
): GameState {
  const clone = cloneGameState(state);
  applyAction(clone, action, rng);
  return clone;
}

// ── Play Card (Action Phase) ────────────────────────────────────────────────

function handlePlayCard(state: GameState, cardId: number): void {
  const player = state.players[state.currentPlayerIndex];
  const cardIdx = player.hand.findIndex((c) => c.id === cardId);
  if (cardIdx < 0) return;

  const card = player.hand[cardIdx];
  player.hand.splice(cardIdx, 1);
  state.discardPile.unshift(card);

  state.actionLog?.push({
    turn: state.turnCount,
    playerIndex: state.currentPlayerIndex,
    action: "play-card",
    cardType: card.type,
    cardIds: [cardId],
  });

  enterNopeWindow(
    state,
    { type: "play-card", cardId },
    [cardId],
    state.currentPlayerIndex,
    card.type,
  );
}

// ── Play Combo (Action Phase) ───────────────────────────────────────────────

function handlePlayCombo(state: GameState, cardIds: number[]): void {
  const player = state.players[state.currentPlayerIndex];
  const cards = cardIds
    .map((id) => player.hand.find((c) => c.id === id))
    .filter((c): c is Card => c !== undefined);

  if (cards.length !== cardIds.length) return;

  for (const id of cardIds) {
    const idx = player.hand.findIndex((c) => c.id === id);
    if (idx >= 0) player.hand.splice(idx, 1);
  }
  state.discardPile.unshift(...cards);

  let comboType: "pair" | "triple" | "five-different";
  if (cardIds.length === 5) {
    comboType = "five-different";
  } else if (cardIds.length === 3) {
    comboType = "triple";
  } else {
    comboType = "pair";
  }

  state.actionLog?.push({
    turn: state.turnCount,
    playerIndex: state.currentPlayerIndex,
    action: "play-combo",
    cardType: cards[0].type,
    cardTypes: comboType === "five-different" ? cards.map((c) => c.type) : undefined,
    cardIds,
    detail: comboType,
  });

  enterNopeWindow(
    state,
    { type: "play-combo", cardIds },
    cardIds,
    state.currentPlayerIndex,
    comboType,
  );
}

// ── End Action Phase (Draw) ─────────────────────────────────────────────────

function handleEndActionPhase(state: GameState): void {
  if (state.drawPile.length === 0) {
    state.phase = "game-over";
    return;
  }

  // biome-ignore lint/style/noNonNullAssertion: drawPile.length checked above — shift always returns a card
  const drawn = state.drawPile.shift()!;

  if (drawn.type === "exploding-kitten") {
    state.actionLog?.push({
      turn: state.turnCount,
      playerIndex: state.currentPlayerIndex,
      action: "draw",
      cardType: "exploding-kitten",
    });

    state.phase = "exploding";
    state.explosionContext = {
      playerIndex: state.currentPlayerIndex,
      kittenCard: drawn,
    };
    return;
  }

  state.players[state.currentPlayerIndex].hand.push(drawn);

  state.actionLog?.push({
    turn: state.turnCount,
    playerIndex: state.currentPlayerIndex,
    action: "draw",
    cardType: drawn.type,
  });

  advanceTurn(state);
}

// ── Nope Window ─────────────────────────────────────────────────────────────

function enterNopeWindow(
  state: GameState,
  pendingAction: Action,
  pendingCardIds: number[],
  sourcePlayerIndex: number,
  effectType: CardType | "pair" | "triple" | "five-different",
): void {
  const firstPoll = nextAlivePlayerIndex(state.players, sourcePlayerIndex);

  if (firstPoll === sourcePlayerIndex) {
    resolveEffect(state, effectType, sourcePlayerIndex);
    return;
  }

  const hasAnyNope = state.players.some(
    (p) => p.alive && p.index !== sourcePlayerIndex && p.hand.some((c) => c.type === "nope"),
  );

  if (!hasAnyNope) {
    resolveEffect(state, effectType, sourcePlayerIndex);
    return;
  }

  state.phase = "nope-window";
  state.nopeWindow = {
    pendingAction,
    pendingCardIds,
    sourcePlayerIndex,
    effectType,
    nopeChain: [],
    currentPollingIndex: firstPoll,
    passedPlayerIndices: [],
  };
}

function handleNope(state: GameState, cardId: number): void {
  if (!state.nopeWindow) throw new Error("nopeWindow must exist when handling nope");
  const nw = state.nopeWindow;
  const noper = nw.currentPollingIndex;
  const player = state.players[noper];
  const cardIdx = player.hand.findIndex((c) => c.id === cardId);
  if (cardIdx < 0) return;

  const nopeCard = player.hand[cardIdx];
  player.hand.splice(cardIdx, 1);
  state.discardPile.unshift(nopeCard);
  nw.nopeChain.push({ playerIndex: noper, cardId });

  state.actionLog?.push({
    turn: state.turnCount,
    playerIndex: noper,
    action: "nope",
    cardIds: [cardId],
  });

  const hasMoreNopes = state.players.some(
    (p) => p.alive && p.index !== noper && p.hand.some((c) => c.type === "nope"),
  );

  if (!hasMoreNopes) {
    const noped = nw.nopeChain.length % 2 === 1;
    if (noped) {
      state.phase = "action-phase";
      state.nopeWindow = null;
    } else {
      const effectType = nw.effectType;
      const sourcePlayer = nw.sourcePlayerIndex;
      state.nopeWindow = null;
      resolveEffect(state, effectType, sourcePlayer);
    }
    return;
  }

  nw.currentPollingIndex = nextAlivePlayerExcluding(state.players, noper, noper);
  nw.passedPlayerIndices = [];
}

function handlePassNope(state: GameState): void {
  if (!state.nopeWindow) throw new Error("nopeWindow must exist when handling pass-nope");
  const nw = state.nopeWindow;
  nw.passedPlayerIndices.push(nw.currentPollingIndex);

  const lastNoper =
    nw.nopeChain.length > 0 ? nw.nopeChain[nw.nopeChain.length - 1].playerIndex : null;

  const playersToCheck = state.players.filter(
    (p) => p.alive && p.index !== nw.sourcePlayerIndex && p.index !== lastNoper,
  );
  const allPassed = playersToCheck.every((p) => nw.passedPlayerIndices.includes(p.index));

  if (allPassed) {
    const noped = nw.nopeChain.length % 2 === 1;
    if (noped) {
      state.phase = "action-phase";
      state.nopeWindow = null;
    } else {
      const effectType = nw.effectType;
      const sourcePlayer = nw.sourcePlayerIndex;
      state.nopeWindow = null;
      resolveEffect(state, effectType, sourcePlayer);
    }
    return;
  }

  nw.currentPollingIndex = nextAlivePlayerExcluding(
    state.players,
    nw.currentPollingIndex,
    lastNoper ?? nw.sourcePlayerIndex,
  );
}

// ── Effect Resolution ───────────────────────────────────────────────────────

function resolveEffect(
  state: GameState,
  effectType: CardType | "pair" | "triple" | "five-different",
  sourcePlayer: number,
): void {
  switch (effectType) {
    case "attack":
      resolveAttack(state);
      break;
    case "skip":
      resolveSkip(state);
      break;
    case "favor":
      resolveFavor(state, sourcePlayer);
      break;
    case "shuffle":
      resolveShuffle(state);
      break;
    case "see-the-future":
      resolveSeeTheFuture(state, sourcePlayer);
      break;
    case "pair":
      resolveStealSetup(state, sourcePlayer, false);
      break;
    case "triple":
      resolveStealSetup(state, sourcePlayer, true);
      break;
    case "five-different":
      resolveFiveDifferent(state, sourcePlayer);
      break;
    default:
      state.phase = "action-phase";
      state.nopeWindow = null;
      break;
  }
}

function resolveAttack(state: GameState): void {
  const nextPlayer = nextAlivePlayerIndex(state.players, state.currentPlayerIndex);

  state.actionLog?.push({
    turn: state.turnCount,
    playerIndex: state.currentPlayerIndex,
    action: "attack",
    targetPlayerIndex: nextPlayer,
  });

  state.phase = "action-phase";
  state.nopeWindow = null;
  state.turnsRemaining = state.turnsRemaining - 1 + 2;
  state.currentPlayerIndex = nextPlayer;
  state.turnCount += 1;
}

function resolveSkip(state: GameState): void {
  state.actionLog?.push({
    turn: state.turnCount,
    playerIndex: state.currentPlayerIndex,
    action: "skip-turn",
  });

  state.nopeWindow = null;
  advanceTurn(state);
}

function resolveFavor(state: GameState, sourcePlayer: number): void {
  const targets = state.players.filter(
    (p) => p.alive && p.index !== sourcePlayer && p.hand.length > 0,
  );

  state.nopeWindow = null;

  if (targets.length === 0) {
    state.phase = "action-phase";
    return;
  }

  if (targets.length === 1) {
    state.phase = "resolving-favor";
    state.favorContext = {
      fromPlayer: sourcePlayer,
      targetPlayer: targets[0].index,
    };
    return;
  }

  state.phase = "choosing-target";
  state.favorContext = {
    fromPlayer: sourcePlayer,
    targetPlayer: -1,
  };
}

function resolveShuffle(state: GameState): void {
  state.actionLog?.push({
    turn: state.turnCount,
    playerIndex: state.currentPlayerIndex,
    action: "shuffle",
  });

  shuffleInPlace(state.drawPile, activeRng);
  state.phase = "action-phase";
  state.nopeWindow = null;
}

function resolveSeeTheFuture(state: GameState, sourcePlayer: number): void {
  state.actionLog?.push({
    turn: state.turnCount,
    playerIndex: sourcePlayer,
    action: "peek",
  });

  state.phase = "peeking";
  state.nopeWindow = null;
  state.peekContext = { playerIndex: sourcePlayer, cards: state.drawPile.slice(0, 3) };
}

function resolveStealSetup(state: GameState, sourcePlayer: number, isNamed: boolean): void {
  const targets = state.players.filter(
    (p) => p.alive && p.index !== sourcePlayer && p.hand.length > 0,
  );

  state.nopeWindow = null;

  if (targets.length === 0) {
    state.phase = "action-phase";
    return;
  }

  state.phase = "choosing-target";
  state.stealContext = {
    fromPlayer: sourcePlayer,
    targetPlayer: null,
    isNamedSteal: isNamed,
    namedType: null,
  };
}

function resolveFiveDifferent(state: GameState, sourcePlayer: number): void {
  state.nopeWindow = null;

  if (state.discardPile.length === 0) {
    state.phase = "action-phase";
    return;
  }

  state.phase = "choosing-discard";
  state.discardPickContext = { playerIndex: sourcePlayer };
}

// ── Target Selection ────────────────────────────────────────────────────────

function handleSelectTarget(state: GameState, targetIndex: number, rng: Rng): void {
  if (state.favorContext && state.favorContext.targetPlayer === -1) {
    state.phase = "resolving-favor";
    state.favorContext.targetPlayer = targetIndex;
    return;
  }

  if (state.stealContext) {
    const sc = state.stealContext;

    if (sc.isNamedSteal) {
      state.phase = "choosing-card-name";
      sc.targetPlayer = targetIndex;
      return;
    }

    const target = state.players[targetIndex];
    if (target.hand.length === 0) {
      state.phase = "action-phase";
      state.stealContext = null;
      return;
    }

    const randomIdx = Math.floor(rng() * target.hand.length);
    const stolenCard = target.hand[randomIdx];
    target.hand.splice(randomIdx, 1);
    state.players[sc.fromPlayer].hand.push(stolenCard);

    state.actionLog?.push({
      turn: state.turnCount,
      playerIndex: sc.fromPlayer,
      action: "steal",
      targetPlayerIndex: targetIndex,
      cardType: stolenCard.type,
      detail: "random",
    });

    state.phase = "action-phase";
    state.stealContext = null;
  }
}

// ── Give Card (Favor) ───────────────────────────────────────────────────────

function handleGiveCard(state: GameState, cardId: number): void {
  if (!state.favorContext) throw new Error("favorContext must exist when handling give-card");
  const fc = state.favorContext;
  const target = state.players[fc.targetPlayer];
  const cardIdx = target.hand.findIndex((c) => c.id === cardId);
  if (cardIdx < 0) return;

  const card = target.hand[cardIdx];
  target.hand.splice(cardIdx, 1);
  state.players[fc.fromPlayer].hand.push(card);

  state.actionLog?.push({
    turn: state.turnCount,
    playerIndex: fc.fromPlayer,
    action: "favor-give",
    targetPlayerIndex: fc.targetPlayer,
    cardType: card.type,
  });

  state.phase = "action-phase";
  state.favorContext = null;
}

// ── Name Card Type (Triple Steal) ───────────────────────────────────────────

function handleNameCardType(state: GameState, cardType: CardType): void {
  if (!state.stealContext) throw new Error("stealContext must exist when handling name-card-type");
  const sc = state.stealContext;
  if (sc.targetPlayer === null) throw new Error("targetPlayer must be set when naming card type");
  const targetPlayerIndex = sc.targetPlayer;
  const target = state.players[targetPlayerIndex];
  const foundIdx = target.hand.findIndex((c) => c.type === cardType);

  if (foundIdx >= 0) {
    const found = target.hand[foundIdx];
    target.hand.splice(foundIdx, 1);
    state.players[sc.fromPlayer].hand.push(found);
  }

  state.actionLog?.push({
    turn: state.turnCount,
    playerIndex: sc.fromPlayer,
    action: "steal",
    targetPlayerIndex: targetPlayerIndex,
    cardType,
    detail: foundIdx >= 0 ? "named-success" : "named-miss",
  });

  state.phase = "action-phase";
  state.stealContext = null;
}

// ── Select Discard Card (Five-Different Combo) ──────────────────────────────

function handleSelectDiscardCard(state: GameState, cardId: number): void {
  if (!state.discardPickContext)
    throw new Error("discardPickContext must exist when handling select-discard-card");
  const dc = state.discardPickContext;
  const cardIdx = state.discardPile.findIndex((c) => c.id === cardId);
  if (cardIdx < 0) return;

  const card = state.discardPile[cardIdx];
  state.discardPile.splice(cardIdx, 1);
  state.players[dc.playerIndex].hand.push(card);

  state.actionLog?.push({
    turn: state.turnCount,
    playerIndex: dc.playerIndex,
    action: "discard-pick",
    cardType: card.type,
  });

  state.phase = "action-phase";
  state.discardPickContext = null;
}

// ── Peek (See the Future) ───────────────────────────────────────────────────

function handleAcknowledgePeek(state: GameState): void {
  state.phase = "action-phase";
  state.peekContext = null;
}

// ── Explosion / Defuse ──────────────────────────────────────────────────────

function handlePlayDefuse(state: GameState, cardId: number): void {
  if (!state.explosionContext)
    throw new Error("explosionContext must exist when handling play-defuse");
  const ec = state.explosionContext;
  const player = state.players[ec.playerIndex];
  const cardIdx = player.hand.findIndex((c) => c.id === cardId);
  if (cardIdx < 0) return;

  const defuseCard = player.hand[cardIdx];
  player.hand.splice(cardIdx, 1);
  state.discardPile.unshift(defuseCard);

  state.actionLog?.push({
    turn: state.turnCount,
    playerIndex: ec.playerIndex,
    action: "defuse",
    cardIds: [cardId],
  });

  state.phase = "reinserting";
}

function handleReinsertKitten(state: GameState, position: number): void {
  if (!state.explosionContext)
    throw new Error("explosionContext must exist when handling reinsert-kitten");
  const ec = state.explosionContext;
  state.drawPile.splice(position, 0, ec.kittenCard);

  state.actionLog?.push({
    turn: state.turnCount,
    playerIndex: ec.playerIndex,
    action: "reinsert",
  });

  state.explosionContext = null;
  advanceTurn(state);
}

function handleSkipDefuse(state: GameState): void {
  if (!state.explosionContext)
    throw new Error("explosionContext must exist when handling skip-defuse");
  const ec = state.explosionContext;
  const player = state.players[ec.playerIndex];

  state.actionLog?.push({
    turn: state.turnCount,
    playerIndex: ec.playerIndex,
    action: "exploded",
  });

  state.discardPile.unshift(ec.kittenCard, ...player.hand);
  player.hand.length = 0;
  player.alive = false;

  state.explosionContext = null;

  const alivePlayers = state.players.filter((p) => p.alive);

  if (alivePlayers.length === 1) {
    state.phase = "game-over";
    state.winner = alivePlayers[0].index;
    return;
  }

  state.phase = "action-phase";
  state.currentPlayerIndex = nextAlivePlayerIndex(state.players, ec.playerIndex);
  state.turnsRemaining = 1;
  state.turnCount += 1;
}

// ── Turn Advancement ────────────────────────────────────────────────────────

function advanceTurn(state: GameState): void {
  state.turnsRemaining -= 1;
  state.turnCount += 1;

  if (state.turnsRemaining > 0) {
    // Forced extra turn (e.g. from Attack) — same player, new turn number
    state.phase = "action-phase";
    return;
  }

  state.phase = "action-phase";
  state.currentPlayerIndex = nextAlivePlayerIndex(state.players, state.currentPlayerIndex);
  state.turnsRemaining = 1;
}

// ── Utilities ───────────────────────────────────────────────────────────────

function nextAlivePlayerIndex(players: PlayerState[], currentIndex: number): number {
  const count = players.length;
  let next = (currentIndex + 1) % count;
  while (!players[next].alive) {
    next = (next + 1) % count;
    if (next === currentIndex) return currentIndex;
  }
  return next;
}

function nextAlivePlayerExcluding(
  players: PlayerState[],
  currentIndex: number,
  excludeIndex: number,
): number {
  const count = players.length;
  let next = (currentIndex + 1) % count;
  let attempts = 0;
  while ((!players[next].alive || next === excludeIndex) && attempts < count) {
    next = (next + 1) % count;
    attempts++;
  }
  return next;
}
