import {
  ACT_ACK_PEEK,
  ACT_DEFUSE,
  ACT_END_ACTION,
  ACT_GIVE_CARD,
  ACT_NAME_TYPE,
  ACT_NOPE,
  ACT_PASS_NOPE,
  ACT_PLAY_CARD,
  ACT_PLAY_COMBO,
  ACT_REINSERT,
  ACT_SELECT_DISCARD,
  ACT_SELECT_TARGET,
  ACT_SKIP_DEFUSE,
  CARD_TYPE_FOR_ID,
  CT_ATTACK,
  CT_DEFUSE,
  CT_EXPLODING,
  CT_FAVOR,
  CT_NOPE,
  CT_SEE_FUTURE,
  CT_SHUFFLE,
  CT_SKIP,
  type FastAction,
  type FastState,
  makeAction,
  PH_ACTION,
  PH_CHOOSING_DISCARD,
  PH_CHOOSING_NAME,
  PH_CHOOSING_TARGET,
  PH_EXPLODING,
  PH_FAVOR,
  PH_GAME_OVER,
  PH_NOPE,
  PH_PEEKING,
  PH_REINSERTING,
} from "./types";

// ── Clone ───────────────────────────────────────────────────────────────────

export function cloneFastState(s: FastState): FastState {
  return {
    drawPile: s.drawPile.slice(),
    discardPile: s.discardPile.slice(),
    hands: s.hands.map((h) => h.slice()),
    alive: s.alive.slice(),
    currentPlayer: s.currentPlayer,
    turnsRemaining: s.turnsRemaining,
    phase: s.phase,
    gameOver: s.gameOver,
    winner: s.winner,
    playerCount: s.playerCount,
    nopeSourcePlayer: s.nopeSourcePlayer,
    nopeEffectType: s.nopeEffectType,
    nopeChainLength: s.nopeChainLength,
    nopePollingPlayer: s.nopePollingPlayer,
    nopePassed: s.nopePassed.slice(),
    favorFrom: s.favorFrom,
    favorTarget: s.favorTarget,
    stealFrom: s.stealFrom,
    stealTarget: s.stealTarget,
    stealIsNamed: s.stealIsNamed,
    explodingPlayer: s.explodingPlayer,
    explodingCardId: s.explodingCardId,
  };
}

// ── Legal Actions ───────────────────────────────────────────────────────────

export function getLegalActionsFast(s: FastState): FastAction[] {
  switch (s.phase) {
    case PH_ACTION:
      return getActionPhaseFast(s);
    case PH_NOPE:
      return getNopeFast(s);
    case PH_CHOOSING_TARGET:
      return getTargetsFast(s);
    case PH_FAVOR:
      return getFavorFast(s);
    case PH_CHOOSING_NAME:
      return getNameFast();
    case PH_CHOOSING_DISCARD:
      return getDiscardPickFast(s);
    case PH_PEEKING:
      return [makeAction(ACT_ACK_PEEK, { key: "ack" })];
    case PH_EXPLODING:
      return getExplosionFast(s);
    case PH_REINSERTING:
      return getReinsertFast(s);
    default:
      return [];
  }
}

function getActionPhaseFast(s: FastState): FastAction[] {
  const hand = s.hands[s.currentPlayer];
  const actions: FastAction[] = [];

  for (const cardId of hand) {
    const ct = CARD_TYPE_FOR_ID[cardId];
    if (
      ct === CT_ATTACK ||
      ct === CT_SKIP ||
      ct === CT_FAVOR ||
      ct === CT_SHUFFLE ||
      ct === CT_SEE_FUTURE
    ) {
      actions.push(
        makeAction(ACT_PLAY_CARD, {
          cardId,
          key: `pc:${cardId}`,
        }),
      );
    }
  }

  const byType = new Map<number, number[]>();
  for (const cardId of hand) {
    const ct = CARD_TYPE_FOR_ID[cardId];
    if (ct === CT_EXPLODING) continue;
    const list = byType.get(ct) ?? [];
    list.push(cardId);
    byType.set(ct, list);
  }

  for (const [, cards] of byType) {
    if (cards.length >= 2) {
      actions.push(
        makeAction(ACT_PLAY_COMBO, {
          cardIds: [cards[0], cards[1]],
          key: `co:${cards[0]}:${cards[1]}`,
        }),
      );
    }
    if (cards.length >= 3) {
      actions.push(
        makeAction(ACT_PLAY_COMBO, {
          cardIds: [cards[0], cards[1], cards[2]],
          key: `co3:${cards[0]}:${cards[1]}:${cards[2]}`,
        }),
      );
    }
  }

  actions.push(makeAction(ACT_END_ACTION, { key: "end" }));
  return actions;
}

function getNopeFast(s: FastState): FastAction[] {
  const hand = s.hands[s.nopePollingPlayer];
  const actions: FastAction[] = [makeAction(ACT_PASS_NOPE, { key: "pass" })];

  for (const cardId of hand) {
    if (CARD_TYPE_FOR_ID[cardId] === CT_NOPE) {
      actions.push(makeAction(ACT_NOPE, { cardId, key: `nope:${cardId}` }));
      break;
    }
  }

  return actions;
}

function getTargetsFast(s: FastState): FastAction[] {
  const decider = s.stealFrom >= 0 ? s.stealFrom : s.favorFrom;
  return s.alive
    .map((alive, i) =>
      alive && i !== decider && s.hands[i].length > 0
        ? makeAction(ACT_SELECT_TARGET, {
            targetIndex: i,
            key: `t:${i}`,
          })
        : null,
    )
    .filter((a): a is FastAction => a !== null);
}

function getFavorFast(s: FastState): FastAction[] {
  return s.hands[s.favorTarget].map((cardId) =>
    makeAction(ACT_GIVE_CARD, { cardId, key: `give:${cardId}` }),
  );
}

function getNameFast(): FastAction[] {
  const types = [
    CT_DEFUSE,
    CT_ATTACK,
    CT_SKIP,
    CT_FAVOR,
    CT_SHUFFLE,
    CT_SEE_FUTURE,
    CT_NOPE,
    8,
    9,
    10,
    11,
    12,
  ];
  return types.map((ct) => makeAction(ACT_NAME_TYPE, { cardType: ct, key: `name:${ct}` }));
}

function getDiscardPickFast(s: FastState): FastAction[] {
  return s.discardPile.map((cardId) =>
    makeAction(ACT_SELECT_DISCARD, { cardId, key: `dpick:${cardId}` }),
  );
}

function getExplosionFast(s: FastState): FastAction[] {
  const hand = s.hands[s.explodingPlayer];
  const defuses = hand.filter((id) => CARD_TYPE_FOR_ID[id] === CT_DEFUSE);

  if (defuses.length > 0) {
    return [
      makeAction(ACT_DEFUSE, {
        cardId: defuses[0],
        key: `defuse:${defuses[0]}`,
      }),
    ];
  }
  return [makeAction(ACT_SKIP_DEFUSE, { key: "die" })];
}

function getReinsertFast(s: FastState): FastAction[] {
  const actions: FastAction[] = [];
  for (let i = 0; i <= s.drawPile.length; i++) {
    actions.push(makeAction(ACT_REINSERT, { position: i, key: `ri:${i}` }));
  }
  return actions;
}

// ── Apply Action (Mutates In Place) ─────────────────────────────────────────

export function applyActionFast(s: FastState, a: FastAction): void {
  switch (a.kind) {
    case ACT_PLAY_CARD:
      applyPlayCardFast(s, a.cardId);
      break;
    case ACT_PLAY_COMBO:
      applyPlayComboFast(s, a.cardIds);
      break;
    case ACT_END_ACTION:
      applyDrawFast(s);
      break;
    case ACT_NOPE:
      applyNopeFast(s, a.cardId);
      break;
    case ACT_PASS_NOPE:
      applyPassNopeFast(s);
      break;
    case ACT_SELECT_TARGET:
      applySelectTargetFast(s, a.targetIndex);
      break;
    case ACT_GIVE_CARD:
      applyGiveCardFast(s, a.cardId);
      break;
    case ACT_NAME_TYPE:
      applyNameTypeFast(s, a.cardType);
      break;
    case ACT_SELECT_DISCARD:
      applySelectDiscardFast(s, a.cardId);
      break;
    case ACT_ACK_PEEK:
      s.phase = PH_ACTION;
      break;
    case ACT_DEFUSE:
      applyDefuseFast(s, a.cardId);
      break;
    case ACT_REINSERT:
      applyReinsertFast(s, a.position);
      break;
    case ACT_SKIP_DEFUSE:
      applySkipDefuseFast(s);
      break;
  }
}

function removeFromHand(hand: number[], cardId: number): void {
  const idx = hand.indexOf(cardId);
  if (idx >= 0) hand.splice(idx, 1);
}

function nextAlive(s: FastState, from: number): number {
  let next = (from + 1) % s.playerCount;
  let attempts = 0;
  while (!s.alive[next] && attempts < s.playerCount) {
    next = (next + 1) % s.playerCount;
    attempts++;
  }
  return next;
}

function nextAliveExcluding(s: FastState, from: number, exclude: number): number {
  let next = (from + 1) % s.playerCount;
  let attempts = 0;
  while ((!s.alive[next] || next === exclude) && attempts < s.playerCount) {
    next = (next + 1) % s.playerCount;
    attempts++;
  }
  return next;
}

function countAlive(s: FastState): number {
  return s.alive.filter(Boolean).length;
}

function applyPlayCardFast(s: FastState, cardId: number): void {
  removeFromHand(s.hands[s.currentPlayer], cardId);
  s.discardPile.unshift(cardId);

  const ct = CARD_TYPE_FOR_ID[cardId];

  const hasAnyNope = s.alive.some(
    (alive, i) =>
      alive && i !== s.currentPlayer && s.hands[i].some((id) => CARD_TYPE_FOR_ID[id] === CT_NOPE),
  );

  if (hasAnyNope) {
    s.phase = PH_NOPE;
    s.nopeSourcePlayer = s.currentPlayer;
    s.nopeEffectType = ct;
    s.nopeChainLength = 0;
    s.nopePollingPlayer = nextAlive(s, s.currentPlayer);
    s.nopePassed = new Array(s.playerCount).fill(false);
  } else {
    resolveEffectFast(s, ct, s.currentPlayer);
  }
}

function applyPlayComboFast(s: FastState, cardIds: number[]): void {
  for (const id of cardIds) {
    removeFromHand(s.hands[s.currentPlayer], id);
    s.discardPile.unshift(id);
  }

  let effectType: number;
  if (cardIds.length === 5) effectType = -3;
  else if (cardIds.length === 3) effectType = -2;
  else effectType = -1;

  const hasAnyNope = s.alive.some(
    (alive, i) =>
      alive && i !== s.currentPlayer && s.hands[i].some((id) => CARD_TYPE_FOR_ID[id] === CT_NOPE),
  );

  if (hasAnyNope) {
    s.phase = PH_NOPE;
    s.nopeSourcePlayer = s.currentPlayer;
    s.nopeEffectType = effectType;
    s.nopeChainLength = 0;
    s.nopePollingPlayer = nextAlive(s, s.currentPlayer);
    s.nopePassed = new Array(s.playerCount).fill(false);
  } else {
    resolveEffectFast(s, effectType, s.currentPlayer);
  }
}

function applyDrawFast(s: FastState): void {
  if (s.drawPile.length === 0) {
    s.gameOver = true;
    s.phase = PH_GAME_OVER;
    return;
  }

  const drawn = s.drawPile.shift()!;

  if (CARD_TYPE_FOR_ID[drawn] === CT_EXPLODING) {
    s.phase = PH_EXPLODING;
    s.explodingPlayer = s.currentPlayer;
    s.explodingCardId = drawn;
  } else {
    s.hands[s.currentPlayer].push(drawn);
    advanceTurnFast(s);
  }
}

function applyNopeFast(s: FastState, cardId: number): void {
  const noper = s.nopePollingPlayer;
  removeFromHand(s.hands[noper], cardId);
  s.discardPile.unshift(cardId);
  s.nopeChainLength++;

  const hasMoreNopes = s.alive.some(
    (alive, i) => alive && i !== noper && s.hands[i].some((id) => CARD_TYPE_FOR_ID[id] === CT_NOPE),
  );

  if (!hasMoreNopes) {
    if (s.nopeChainLength % 2 === 1) {
      s.phase = PH_ACTION;
    } else {
      resolveEffectFast(s, s.nopeEffectType, s.nopeSourcePlayer);
    }
  } else {
    s.nopePollingPlayer = nextAliveExcluding(s, noper, noper);
    s.nopePassed = new Array(s.playerCount).fill(false);
  }
}

function applyPassNopeFast(s: FastState): void {
  s.nopePassed[s.nopePollingPlayer] = true;

  const lastNoper = s.nopeChainLength > 0 ? -1 : s.nopeSourcePlayer;
  const allPassed = s.alive.every(
    (alive, i) => !alive || i === s.nopeSourcePlayer || i === lastNoper || s.nopePassed[i],
  );

  if (allPassed) {
    if (s.nopeChainLength % 2 === 1) {
      s.phase = PH_ACTION;
    } else {
      resolveEffectFast(s, s.nopeEffectType, s.nopeSourcePlayer);
    }
  } else {
    s.nopePollingPlayer = nextAliveExcluding(s, s.nopePollingPlayer, s.nopeSourcePlayer);
  }
}

function resolveEffectFast(s: FastState, effectType: number, source: number): void {
  if (effectType === CT_ATTACK) {
    const next = nextAlive(s, s.currentPlayer);
    s.turnsRemaining = s.turnsRemaining - 1 + 2;
    s.currentPlayer = next;
    s.phase = PH_ACTION;
    return;
  }

  if (effectType === CT_SKIP) {
    advanceTurnFast(s);
    return;
  }

  if (effectType === CT_SHUFFLE) {
    shuffleArray(s.drawPile);
    s.phase = PH_ACTION;
    return;
  }

  if (effectType === CT_SEE_FUTURE) {
    s.phase = PH_PEEKING;
    return;
  }

  if (effectType === CT_FAVOR) {
    const targets = s.alive
      .map((alive, i) => (alive && i !== source && s.hands[i].length > 0 ? i : -1))
      .filter((i) => i >= 0);

    if (targets.length === 0) {
      s.phase = PH_ACTION;
      return;
    }
    if (targets.length === 1) {
      s.favorFrom = source;
      s.favorTarget = targets[0];
      s.phase = PH_FAVOR;
      return;
    }
    s.favorFrom = source;
    s.favorTarget = -1;
    s.stealFrom = -1;
    s.phase = PH_CHOOSING_TARGET;
    return;
  }

  // Pair combo (-1)
  if (effectType === -1) {
    const targets = s.alive
      .map((alive, i) => (alive && i !== source && s.hands[i].length > 0 ? i : -1))
      .filter((i) => i >= 0);
    if (targets.length === 0) {
      s.phase = PH_ACTION;
      return;
    }
    s.stealFrom = source;
    s.stealTarget = -1;
    s.stealIsNamed = false;
    s.favorFrom = -1;
    s.phase = PH_CHOOSING_TARGET;
    return;
  }

  // Triple combo (-2)
  if (effectType === -2) {
    const targets = s.alive
      .map((alive, i) => (alive && i !== source && s.hands[i].length > 0 ? i : -1))
      .filter((i) => i >= 0);
    if (targets.length === 0) {
      s.phase = PH_ACTION;
      return;
    }
    s.stealFrom = source;
    s.stealTarget = -1;
    s.stealIsNamed = true;
    s.favorFrom = -1;
    s.phase = PH_CHOOSING_TARGET;
    return;
  }

  // 5-different combo (-3)
  if (effectType === -3) {
    if (s.discardPile.length === 0) {
      s.phase = PH_ACTION;
      return;
    }
    s.phase = PH_CHOOSING_DISCARD;
    return;
  }

  s.phase = PH_ACTION;
}

function applySelectTargetFast(s: FastState, targetIndex: number): void {
  if (s.favorFrom >= 0 && s.favorTarget < 0) {
    s.favorTarget = targetIndex;
    s.phase = PH_FAVOR;
    return;
  }

  if (s.stealFrom >= 0) {
    s.stealTarget = targetIndex;

    if (s.stealIsNamed) {
      s.phase = PH_CHOOSING_NAME;
      return;
    }

    const targetHand = s.hands[targetIndex];
    if (targetHand.length > 0) {
      const ri = Math.floor(Math.random() * targetHand.length);
      const stolen = targetHand[ri];
      targetHand.splice(ri, 1);
      s.hands[s.stealFrom].push(stolen);
    }
    s.stealFrom = -1;
    s.stealTarget = -1;
    s.phase = PH_ACTION;
  }
}

function applyGiveCardFast(s: FastState, cardId: number): void {
  removeFromHand(s.hands[s.favorTarget], cardId);
  s.hands[s.favorFrom].push(cardId);
  s.favorFrom = -1;
  s.favorTarget = -1;
  s.phase = PH_ACTION;
}

function applyNameTypeFast(s: FastState, cardType: number): void {
  const targetHand = s.hands[s.stealTarget];
  const idx = targetHand.findIndex((id) => CARD_TYPE_FOR_ID[id] === cardType);

  if (idx >= 0) {
    const stolen = targetHand[idx];
    targetHand.splice(idx, 1);
    s.hands[s.stealFrom].push(stolen);
  }

  s.stealFrom = -1;
  s.stealTarget = -1;
  s.phase = PH_ACTION;
}

function applySelectDiscardFast(s: FastState, cardId: number): void {
  const idx = s.discardPile.indexOf(cardId);
  if (idx >= 0) {
    s.discardPile.splice(idx, 1);
    s.hands[s.currentPlayer].push(cardId);
  }
  s.phase = PH_ACTION;
}

function applyDefuseFast(s: FastState, cardId: number): void {
  removeFromHand(s.hands[s.explodingPlayer], cardId);
  s.discardPile.unshift(cardId);
  s.phase = PH_REINSERTING;
}

function applyReinsertFast(s: FastState, position: number): void {
  s.drawPile.splice(position, 0, s.explodingCardId);
  s.explodingPlayer = -1;
  s.explodingCardId = -1;
  advanceTurnFast(s);
}

function applySkipDefuseFast(s: FastState): void {
  const pi = s.explodingPlayer;
  s.alive[pi] = false;
  const hand = s.hands[pi];
  s.discardPile.unshift(s.explodingCardId, ...hand);
  hand.length = 0;

  s.explodingPlayer = -1;
  s.explodingCardId = -1;

  if (countAlive(s) <= 1) {
    s.gameOver = true;
    s.phase = PH_GAME_OVER;
    s.winner = s.alive.indexOf(true);
    return;
  }

  s.currentPlayer = nextAlive(s, pi);
  s.turnsRemaining = 1;
  s.phase = PH_ACTION;
}

function advanceTurnFast(s: FastState): void {
  const remaining = s.turnsRemaining - 1;
  if (remaining > 0) {
    s.turnsRemaining = remaining;
    s.phase = PH_ACTION;
  } else {
    s.currentPlayer = nextAlive(s, s.currentPlayer);
    s.turnsRemaining = 1;
    s.phase = PH_ACTION;
  }
}

// ── Active Decider ──────────────────────────────────────────────────────────

export function getActivePlayerFast(s: FastState): number {
  switch (s.phase) {
    case PH_NOPE:
      return s.nopePollingPlayer;
    case PH_FAVOR:
      return s.favorTarget;
    case PH_CHOOSING_TARGET:
    case PH_CHOOSING_NAME:
      return s.stealFrom >= 0 ? s.stealFrom : s.favorFrom;
    case PH_EXPLODING:
    case PH_REINSERTING:
      return s.explodingPlayer;
    default:
      return s.currentPlayer;
  }
}

// ── Utility ─────────────────────────────────────────────────────────────────

function shuffleArray(arr: number[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
