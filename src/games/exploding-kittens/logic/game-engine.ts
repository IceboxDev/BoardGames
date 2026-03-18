import { dealGame, shuffle } from "./deck";
import type {
  Action,
  ActionLogEntry,
  AIStrategyId,
  Card,
  CardType,
  GameState,
  NopeWindowState,
  PlayerState,
  PlayerType,
} from "./types";

// ── State Creation ──────────────────────────────────────────────────────────

export function createInitialState(
  playerCount: number,
  strategies: (AIStrategyId | null)[],
): GameState {
  const deal = dealGame(playerCount);

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

// ── Main Dispatch ───────────────────────────────────────────────────────────

export function applyAction(state: GameState, action: Action): GameState {
  switch (action.type) {
    case "play-card":
      return handlePlayCard(state, action.cardId);
    case "play-combo":
      return handlePlayCombo(state, action.cardIds);
    case "end-action-phase":
      return handleEndActionPhase(state);
    case "nope":
      return handleNope(state, action.cardId);
    case "pass-nope":
      return handlePassNope(state);
    case "select-target":
      return handleSelectTarget(state, action.targetIndex);
    case "give-card":
      return handleGiveCard(state, action.cardId);
    case "name-card-type":
      return handleNameCardType(state, action.cardType);
    case "select-discard-card":
      return handleSelectDiscardCard(state, action.cardId);
    case "acknowledge-peek":
      return handleAcknowledgePeek(state);
    case "play-defuse":
      return handlePlayDefuse(state, action.cardId);
    case "reinsert-kitten":
      return handleReinsertKitten(state, action.position);
    case "skip-defuse":
      return handleSkipDefuse(state);
    default:
      return state;
  }
}

// ── Play Card (Action Phase) ────────────────────────────────────────────────

function handlePlayCard(state: GameState, cardId: number): GameState {
  const player = state.players[state.currentPlayerIndex];
  const card = player.hand.find((c) => c.id === cardId);
  if (!card) return state;

  const newPlayers = updatePlayerHand(
    state.players,
    state.currentPlayerIndex,
    player.hand.filter((c) => c.id !== cardId),
  );

  const newDiscard = [card, ...state.discardPile];

  const log: ActionLogEntry = {
    turn: state.turnCount,
    playerIndex: state.currentPlayerIndex,
    action: "play-card",
    cardType: card.type,
    cardIds: [cardId],
  };

  return enterNopeWindow(
    {
      ...state,
      players: newPlayers,
      discardPile: newDiscard,
      actionLog: [...state.actionLog, log],
    },
    { type: "play-card", cardId },
    [cardId],
    state.currentPlayerIndex,
    card.type,
  );
}

// ── Play Combo (Action Phase) ───────────────────────────────────────────────

function handlePlayCombo(state: GameState, cardIds: number[]): GameState {
  const player = state.players[state.currentPlayerIndex];
  const cards = cardIds
    .map((id) => player.hand.find((c) => c.id === id))
    .filter((c): c is Card => c !== undefined);

  if (cards.length !== cardIds.length) return state;

  const newHand = player.hand.filter((c) => !cardIds.includes(c.id));
  const newPlayers = updatePlayerHand(state.players, state.currentPlayerIndex, newHand);
  const newDiscard = [...cards, ...state.discardPile];

  let comboType: "pair" | "triple" | "five-different";
  if (cardIds.length === 5) {
    comboType = "five-different";
  } else if (cardIds.length === 3) {
    comboType = "triple";
  } else {
    comboType = "pair";
  }

  const log: ActionLogEntry = {
    turn: state.turnCount,
    playerIndex: state.currentPlayerIndex,
    action: "play-combo",
    cardIds,
    detail: comboType,
  };

  return enterNopeWindow(
    {
      ...state,
      players: newPlayers,
      discardPile: newDiscard,
      actionLog: [...state.actionLog, log],
    },
    { type: "play-combo", cardIds },
    cardIds,
    state.currentPlayerIndex,
    comboType,
  );
}

// ── End Action Phase (Draw) ─────────────────────────────────────────────────

function handleEndActionPhase(state: GameState): GameState {
  if (state.drawPile.length === 0) {
    return { ...state, phase: "game-over" };
  }

  const [drawn, ...restDraw] = state.drawPile;

  if (drawn.type === "exploding-kitten") {
    const log: ActionLogEntry = {
      turn: state.turnCount,
      playerIndex: state.currentPlayerIndex,
      action: "draw",
      cardType: "exploding-kitten",
    };

    return {
      ...state,
      drawPile: restDraw,
      phase: "exploding",
      explosionContext: {
        playerIndex: state.currentPlayerIndex,
        kittenCard: drawn,
      },
      actionLog: [...state.actionLog, log],
    };
  }

  const newPlayers = updatePlayerHand(state.players, state.currentPlayerIndex, [
    ...state.players[state.currentPlayerIndex].hand,
    drawn,
  ]);

  const log: ActionLogEntry = {
    turn: state.turnCount,
    playerIndex: state.currentPlayerIndex,
    action: "draw",
    cardType: drawn.type,
  };

  return advanceTurn({
    ...state,
    drawPile: restDraw,
    players: newPlayers,
    actionLog: [...state.actionLog, log],
  });
}

// ── Nope Window ─────────────────────────────────────────────────────────────

function enterNopeWindow(
  state: GameState,
  pendingAction: Action,
  pendingCardIds: number[],
  sourcePlayerIndex: number,
  effectType: CardType | "pair" | "triple" | "five-different",
): GameState {
  const firstPoll = nextAlivePlayerIndex(state.players, sourcePlayerIndex);

  if (firstPoll === sourcePlayerIndex) {
    return resolveEffect(state, effectType, sourcePlayerIndex);
  }

  const hasAnyNope = state.players.some(
    (p) => p.alive && p.index !== sourcePlayerIndex && p.hand.some((c) => c.type === "nope"),
  );

  if (!hasAnyNope) {
    return resolveEffect(state, effectType, sourcePlayerIndex);
  }

  const nopeWindow: NopeWindowState = {
    pendingAction,
    pendingCardIds,
    sourcePlayerIndex,
    effectType,
    nopeChain: [],
    currentPollingIndex: firstPoll,
    passedPlayerIndices: [],
  };

  return { ...state, phase: "nope-window", nopeWindow };
}

function handleNope(state: GameState, cardId: number): GameState {
  const nw = state.nopeWindow!;
  const noper = nw.currentPollingIndex;
  const player = state.players[noper];
  const nopeCard = player.hand.find((c) => c.id === cardId);
  if (!nopeCard) return state;

  const newPlayers = updatePlayerHand(
    state.players,
    noper,
    player.hand.filter((c) => c.id !== cardId),
  );

  const newDiscard = [nopeCard, ...state.discardPile];

  const newChain = [...nw.nopeChain, { playerIndex: noper, cardId }];

  const log: ActionLogEntry = {
    turn: state.turnCount,
    playerIndex: noper,
    action: "nope",
    cardIds: [cardId],
  };

  const hasMoreNopes = newPlayers.some(
    (p) => p.alive && p.index !== noper && p.hand.some((c) => c.type === "nope"),
  );

  if (!hasMoreNopes) {
    const noped = newChain.length % 2 === 1;
    if (noped) {
      return {
        ...state,
        players: newPlayers,
        discardPile: newDiscard,
        phase: "action-phase",
        nopeWindow: null,
        actionLog: [...state.actionLog, log],
      };
    }
    return resolveEffect(
      {
        ...state,
        players: newPlayers,
        discardPile: newDiscard,
        nopeWindow: null,
        actionLog: [...state.actionLog, log],
      },
      nw.effectType,
      nw.sourcePlayerIndex,
    );
  }

  const nextPoll = nextAlivePlayerExcluding(newPlayers, noper, noper);

  return {
    ...state,
    players: newPlayers,
    discardPile: newDiscard,
    nopeWindow: {
      ...nw,
      nopeChain: newChain,
      currentPollingIndex: nextPoll,
      passedPlayerIndices: [],
    },
    actionLog: [...state.actionLog, log],
  };
}

function handlePassNope(state: GameState): GameState {
  const nw = state.nopeWindow!;
  const passer = nw.currentPollingIndex;
  const newPassed = [...nw.passedPlayerIndices, passer];

  const alivePlayers = state.players.filter((p) => p.alive && p.index !== nw.sourcePlayerIndex);
  const lastNoper =
    nw.nopeChain.length > 0 ? nw.nopeChain[nw.nopeChain.length - 1].playerIndex : null;

  const playersToCheck = alivePlayers.filter((p) => p.index !== lastNoper);

  const allPassed = playersToCheck.every((p) => newPassed.includes(p.index));

  if (allPassed) {
    const noped = nw.nopeChain.length % 2 === 1;
    if (noped) {
      return {
        ...state,
        phase: "action-phase",
        nopeWindow: null,
      };
    }
    return resolveEffect({ ...state, nopeWindow: null }, nw.effectType, nw.sourcePlayerIndex);
  }

  const nextPoll = nextAlivePlayerExcluding(
    state.players,
    passer,
    lastNoper ?? nw.sourcePlayerIndex,
  );

  return {
    ...state,
    nopeWindow: {
      ...nw,
      currentPollingIndex: nextPoll,
      passedPlayerIndices: newPassed,
    },
  };
}

// ── Effect Resolution ───────────────────────────────────────────────────────

function resolveEffect(
  state: GameState,
  effectType: CardType | "pair" | "triple" | "five-different",
  sourcePlayer: number,
): GameState {
  switch (effectType) {
    case "attack":
      return resolveAttack(state);
    case "skip":
      return resolveSkip(state);
    case "favor":
      return resolveFavor(state, sourcePlayer);
    case "shuffle":
      return resolveShuffle(state);
    case "see-the-future":
      return resolveSeeTheFuture(state, sourcePlayer);
    case "pair":
      return resolveStealSetup(state, sourcePlayer, false);
    case "triple":
      return resolveStealSetup(state, sourcePlayer, true);
    case "five-different":
      return resolveFiveDifferent(state, sourcePlayer);
    default:
      return { ...state, phase: "action-phase", nopeWindow: null };
  }
}

function resolveAttack(state: GameState): GameState {
  const nextPlayer = nextAlivePlayerIndex(state.players, state.currentPlayerIndex);
  const nextTurns = state.turnsRemaining - 1 + 2;

  const log: ActionLogEntry = {
    turn: state.turnCount,
    playerIndex: state.currentPlayerIndex,
    action: "attack",
    targetPlayerIndex: nextPlayer,
  };

  return {
    ...state,
    phase: "action-phase",
    nopeWindow: null,
    currentPlayerIndex: nextPlayer,
    turnsRemaining: nextTurns,
    turnCount: state.turnCount + 1,
    actionLog: [...state.actionLog, log],
  };
}

function resolveSkip(state: GameState): GameState {
  const log: ActionLogEntry = {
    turn: state.turnCount,
    playerIndex: state.currentPlayerIndex,
    action: "skip-turn",
  };

  const newState = {
    ...state,
    nopeWindow: null,
    actionLog: [...state.actionLog, log],
  };

  return advanceTurn(newState);
}

function resolveFavor(state: GameState, sourcePlayer: number): GameState {
  const targets = state.players.filter(
    (p) => p.alive && p.index !== sourcePlayer && p.hand.length > 0,
  );

  if (targets.length === 0) {
    return { ...state, phase: "action-phase", nopeWindow: null };
  }

  if (targets.length === 1) {
    return {
      ...state,
      phase: "resolving-favor",
      nopeWindow: null,
      favorContext: {
        fromPlayer: sourcePlayer,
        targetPlayer: targets[0].index,
      },
    };
  }

  return {
    ...state,
    phase: "choosing-target",
    nopeWindow: null,
    favorContext: {
      fromPlayer: sourcePlayer,
      targetPlayer: -1,
    },
  };
}

function resolveShuffle(state: GameState): GameState {
  const log: ActionLogEntry = {
    turn: state.turnCount,
    playerIndex: state.currentPlayerIndex,
    action: "shuffle",
  };

  return {
    ...state,
    drawPile: shuffle(state.drawPile),
    phase: "action-phase",
    nopeWindow: null,
    actionLog: [...state.actionLog, log],
  };
}

function resolveSeeTheFuture(state: GameState, sourcePlayer: number): GameState {
  const topCards = state.drawPile.slice(0, 3);

  const log: ActionLogEntry = {
    turn: state.turnCount,
    playerIndex: sourcePlayer,
    action: "peek",
  };

  return {
    ...state,
    phase: "peeking",
    nopeWindow: null,
    peekContext: { playerIndex: sourcePlayer, cards: topCards },
    actionLog: [...state.actionLog, log],
  };
}

function resolveStealSetup(state: GameState, sourcePlayer: number, isNamed: boolean): GameState {
  const targets = state.players.filter(
    (p) => p.alive && p.index !== sourcePlayer && p.hand.length > 0,
  );

  if (targets.length === 0) {
    return { ...state, phase: "action-phase", nopeWindow: null };
  }

  return {
    ...state,
    phase: "choosing-target",
    nopeWindow: null,
    stealContext: {
      fromPlayer: sourcePlayer,
      targetPlayer: null,
      isNamedSteal: isNamed,
      namedType: null,
    },
  };
}

function resolveFiveDifferent(state: GameState, sourcePlayer: number): GameState {
  if (state.discardPile.length === 0) {
    return { ...state, phase: "action-phase", nopeWindow: null };
  }

  return {
    ...state,
    phase: "choosing-discard",
    nopeWindow: null,
    discardPickContext: { playerIndex: sourcePlayer },
  };
}

// ── Target Selection ────────────────────────────────────────────────────────

function handleSelectTarget(state: GameState, targetIndex: number): GameState {
  if (state.favorContext && state.favorContext.targetPlayer === -1) {
    return {
      ...state,
      phase: "resolving-favor",
      favorContext: { ...state.favorContext, targetPlayer: targetIndex },
    };
  }

  if (state.stealContext) {
    const sc = state.stealContext;

    if (sc.isNamedSteal) {
      return {
        ...state,
        phase: "choosing-card-name",
        stealContext: { ...sc, targetPlayer: targetIndex },
      };
    }

    const target = state.players[targetIndex];
    if (target.hand.length === 0) {
      return {
        ...state,
        phase: "action-phase",
        stealContext: null,
      };
    }

    const randomIdx = Math.floor(Math.random() * target.hand.length);
    const stolenCard = target.hand[randomIdx];

    const newPlayers = state.players.map((p) => {
      if (p.index === targetIndex) {
        return { ...p, hand: p.hand.filter((c) => c.id !== stolenCard.id) };
      }
      if (p.index === sc.fromPlayer) {
        return { ...p, hand: [...p.hand, stolenCard] };
      }
      return p;
    });

    const log: ActionLogEntry = {
      turn: state.turnCount,
      playerIndex: sc.fromPlayer,
      action: "steal",
      targetPlayerIndex: targetIndex,
      detail: "random",
    };

    return {
      ...state,
      players: newPlayers,
      phase: "action-phase",
      stealContext: null,
      actionLog: [...state.actionLog, log],
    };
  }

  return state;
}

// ── Give Card (Favor) ───────────────────────────────────────────────────────

function handleGiveCard(state: GameState, cardId: number): GameState {
  const fc = state.favorContext!;
  const target = state.players[fc.targetPlayer];
  const card = target.hand.find((c) => c.id === cardId);
  if (!card) return state;

  const newPlayers = state.players.map((p) => {
    if (p.index === fc.targetPlayer) {
      return { ...p, hand: p.hand.filter((c) => c.id !== cardId) };
    }
    if (p.index === fc.fromPlayer) {
      return { ...p, hand: [...p.hand, card] };
    }
    return p;
  });

  const log: ActionLogEntry = {
    turn: state.turnCount,
    playerIndex: fc.fromPlayer,
    action: "favor-give",
    targetPlayerIndex: fc.targetPlayer,
    cardType: card.type,
  };

  return {
    ...state,
    players: newPlayers,
    phase: "action-phase",
    favorContext: null,
    actionLog: [...state.actionLog, log],
  };
}

// ── Name Card Type (Triple Steal) ───────────────────────────────────────────

function handleNameCardType(state: GameState, cardType: CardType): GameState {
  const sc = state.stealContext!;
  const target = state.players[sc.targetPlayer!];
  const found = target.hand.find((c) => c.type === cardType);

  const newPlayers = found
    ? state.players.map((p) => {
        if (p.index === sc.targetPlayer) {
          return { ...p, hand: p.hand.filter((c) => c.id !== found.id) };
        }
        if (p.index === sc.fromPlayer) {
          return { ...p, hand: [...p.hand, found] };
        }
        return p;
      })
    : state.players;

  const log: ActionLogEntry = {
    turn: state.turnCount,
    playerIndex: sc.fromPlayer,
    action: "steal",
    targetPlayerIndex: sc.targetPlayer!,
    cardType,
    detail: found ? "named-success" : "named-miss",
  };

  return {
    ...state,
    players: newPlayers,
    phase: "action-phase",
    stealContext: null,
    actionLog: [...state.actionLog, log],
  };
}

// ── Select Discard Card (Five-Different Combo) ──────────────────────────────

function handleSelectDiscardCard(state: GameState, cardId: number): GameState {
  const dc = state.discardPickContext!;
  const card = state.discardPile.find((c) => c.id === cardId);
  if (!card) return state;

  const newDiscard = state.discardPile.filter((c) => c.id !== cardId);
  const newPlayers = updatePlayerHand(state.players, dc.playerIndex, [
    ...state.players[dc.playerIndex].hand,
    card,
  ]);

  return {
    ...state,
    players: newPlayers,
    discardPile: newDiscard,
    phase: "action-phase",
    discardPickContext: null,
  };
}

// ── Peek (See the Future) ───────────────────────────────────────────────────

function handleAcknowledgePeek(state: GameState): GameState {
  return {
    ...state,
    phase: "action-phase",
    peekContext: null,
  };
}

// ── Explosion / Defuse ──────────────────────────────────────────────────────

function handlePlayDefuse(state: GameState, cardId: number): GameState {
  const ec = state.explosionContext!;
  const player = state.players[ec.playerIndex];
  const defuseCard = player.hand.find((c) => c.id === cardId);
  if (!defuseCard) return state;

  const newPlayers = updatePlayerHand(
    state.players,
    ec.playerIndex,
    player.hand.filter((c) => c.id !== cardId),
  );

  const log: ActionLogEntry = {
    turn: state.turnCount,
    playerIndex: ec.playerIndex,
    action: "defuse",
    cardIds: [cardId],
  };

  return {
    ...state,
    players: newPlayers,
    discardPile: [defuseCard, ...state.discardPile],
    phase: "reinserting",
    actionLog: [...state.actionLog, log],
  };
}

function handleReinsertKitten(state: GameState, position: number): GameState {
  const ec = state.explosionContext!;
  const newDraw = [...state.drawPile];
  newDraw.splice(position, 0, ec.kittenCard);

  const log: ActionLogEntry = {
    turn: state.turnCount,
    playerIndex: ec.playerIndex,
    action: "reinsert",
  };

  return advanceTurn({
    ...state,
    drawPile: newDraw,
    explosionContext: null,
    actionLog: [...state.actionLog, log],
  });
}

function handleSkipDefuse(state: GameState): GameState {
  const ec = state.explosionContext!;
  const player = state.players[ec.playerIndex];

  const discardedHand = [...player.hand];
  const newPlayers = state.players.map((p) => {
    if (p.index === ec.playerIndex) {
      return { ...p, hand: [], alive: false };
    }
    return p;
  });

  const newDiscard = [...discardedHand, ec.kittenCard, ...state.discardPile];

  const log: ActionLogEntry = {
    turn: state.turnCount,
    playerIndex: ec.playerIndex,
    action: "exploded",
  };

  const alivePlayers = newPlayers.filter((p) => p.alive);

  if (alivePlayers.length === 1) {
    return {
      ...state,
      players: newPlayers,
      discardPile: newDiscard,
      phase: "game-over",
      explosionContext: null,
      winner: alivePlayers[0].index,
      actionLog: [...state.actionLog, log],
    };
  }

  const nextPlayer = nextAlivePlayerIndex(newPlayers, ec.playerIndex);

  return {
    ...state,
    players: newPlayers,
    discardPile: newDiscard,
    phase: "action-phase",
    explosionContext: null,
    currentPlayerIndex: nextPlayer,
    turnsRemaining: 1,
    turnCount: state.turnCount + 1,
    actionLog: [...state.actionLog, log],
  };
}

// ── Turn Advancement ────────────────────────────────────────────────────────

function advanceTurn(state: GameState): GameState {
  const newTurnsRemaining = state.turnsRemaining - 1;

  if (newTurnsRemaining > 0) {
    return {
      ...state,
      phase: "action-phase",
      turnsRemaining: newTurnsRemaining,
    };
  }

  const nextPlayer = nextAlivePlayerIndex(state.players, state.currentPlayerIndex);

  return {
    ...state,
    phase: "action-phase",
    currentPlayerIndex: nextPlayer,
    turnsRemaining: 1,
    turnCount: state.turnCount + 1,
  };
}

// ── Utilities ───────────────────────────────────────────────────────────────

function updatePlayerHand(
  players: PlayerState[],
  playerIndex: number,
  newHand: Card[],
): PlayerState[] {
  return players.map((p) => (p.index === playerIndex ? { ...p, hand: newHand } : p));
}

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
