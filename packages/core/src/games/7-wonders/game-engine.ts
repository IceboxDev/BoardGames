import type { Rng } from "../../lib/rng";
import { createRng } from "../../lib/rng";
import { countShields, hasBuiltStageEffect, instantCoins } from "./board";
import { getCardDef } from "./cards";
import { assignWonders, buildAgeDeck, dealHands } from "./deck";
import { getLegalActions } from "./rules";
import { determineWinner, scoreFinal } from "./scoring";
import type {
  Age,
  GameState,
  MilitaryOutcome,
  PendingAction,
  PlayerState,
  RevealedPlay,
  Selection,
  SevenWondersAction,
  SevenWondersConfig,
} from "./types";
import {
  cardIdName,
  DISCARD_COIN_VALUE,
  leftOf,
  MILITARY_DEFEAT_POINTS,
  MILITARY_VICTORY_POINTS,
  passDirection,
  rightOf,
  STARTING_COINS,
  TURNS_PER_AGE,
} from "./types";
import { getWonderDef } from "./wonders";

export function createInitialState(config: SevenWondersConfig, rng?: Rng): GameState {
  const { playerCount, seed, sideMode } = config;
  if (playerCount < 3 || playerCount > 7) {
    throw new Error(`7 Wonders supports 3-7 players, got ${playerCount}`);
  }
  const rand = rng ?? createRng(seed);

  const wonders = assignWonders(playerCount, rand, sideMode);
  const players: PlayerState[] = wonders.map(({ wonderId, side }) => ({
    wonderId,
    side,
    stagesBuilt: 0,
    coins: STARTING_COINS,
    tableau: [],
    militaryTokens: [],
    freeBuildUsedThisAge: false,
  }));

  // All three decks are shuffled up front so the whole game is a pure
  // function of (seed, config, actions).
  const hands = dealHands(buildAgeDeck(1, playerCount, rand), playerCount);
  const ageDecks = {
    2: buildAgeDeck(2, playerCount, rand),
    3: buildAgeDeck(3, playerCount, rand),
  };

  return {
    seed,
    playerCount,
    age: 1,
    turn: 1,
    phase: "selecting",
    players,
    hands,
    selections: players.map(() => null),
    discard: [],
    pendingQueue: [],
    ageDecks,
    lastRevealed: [],
    actionLog: [{ type: "age-start", age: 1 }],
  };
}

// ── Action identity (wire payloads may order keys differently) ─────────────

function paymentKey(p: { kind: string; left?: number; right?: number }): string {
  return p.kind === "resources" ? `r:${p.left}:${p.right}` : p.kind;
}

function actionKey(a: SevenWondersAction): string {
  switch (a.type) {
    case "play-card":
      return `play|${a.cardId}|${paymentKey(a.payment)}`;
    case "build-wonder":
      return `wonder|${a.cardId}|${paymentKey(a.payment)}`;
    case "discard":
      return `discard|${a.cardId}`;
    case "pick-discard":
      return `pick|${a.cardId}`;
    case "skip-pending":
      return "skip";
    case "play-seventh":
      return `seventh|${actionKey(a.action)}`;
  }
}

function assertLegal(state: GameState, playerIndex: number, action: SevenWondersAction): void {
  const key = actionKey(action);
  if (!getLegalActions(state, playerIndex).some((legal) => actionKey(legal) === key)) {
    throw new Error(`Illegal action for player ${playerIndex}: ${key}`);
  }
}

// ── Selection phase ─────────────────────────────────────────────────────────

export function allSelected(state: GameState): boolean {
  return state.selections.every((s) => s !== null);
}

export function applySelection(
  state: GameState,
  playerIndex: number,
  selection: Selection,
): GameState {
  if (state.phase !== "selecting") throw new Error("Not in selecting phase");
  if (state.selections[playerIndex] !== null) throw new Error("Already selected");
  assertLegal(state, playerIndex, selection);

  const selections = state.selections.map((s, i) => (i === playerIndex ? selection : s));
  const phase = selections.every((s) => s !== null) ? "revealing" : "selecting";
  return { ...state, selections, phase };
}

// ── Reveal ──────────────────────────────────────────────────────────────────

function clonePlayers(players: PlayerState[]): PlayerState[] {
  return players.map((p) => ({
    ...p,
    tableau: [...p.tableau],
    militaryTokens: [...p.militaryTokens],
  }));
}

/**
 * Resolve all simultaneous selections: pay coins (validated against
 * pre-reveal coins when selected), place cards / build stages / discard,
 * grant instant coin effects on the post-placement board, then either enter
 * the pending phase (Babylon 7th card, Halikarnassos discard build) or finish
 * the turn (rotate hands / resolve military at age end).
 */
export function applyReveal(state: GameState): GameState {
  if (state.phase !== "revealing") throw new Error("Not in revealing phase");
  const n = state.playerCount;
  const players = clonePlayers(state.players);
  const hands = state.hands.map((h) => [...h]);
  const discard = [...state.discard];
  const plays: RevealedPlay[] = [];
  const halikarnassos: PendingAction[] = [];

  // 1. Coin movements — all against pre-reveal balances.
  const deltas = new Array<number>(n).fill(0);
  for (let i = 0; i < n; i++) {
    const sel = state.selections[i];
    if (
      !sel ||
      (sel.type !== "play-card" && sel.type !== "build-wonder" && sel.type !== "discard")
    ) {
      throw new Error("Reveal with missing or invalid selection");
    }
    if (sel.type === "discard") continue;
    if (sel.payment.kind !== "resources") continue;
    deltas[i] -= sel.payment.left + sel.payment.right;
    deltas[leftOf(i, n)] += sel.payment.left;
    deltas[rightOf(i, n)] += sel.payment.right;
    if (sel.type === "play-card") {
      deltas[i] -= getCardDef(cardIdName(sel.cardId)).cost.coins ?? 0;
    } else {
      const stage = getWonderDef(players[i].wonderId).sides[players[i].side].stages[
        players[i].stagesBuilt
      ];
      deltas[i] -= stage.cost.coins ?? 0;
    }
  }
  for (let i = 0; i < n; i++) players[i].coins += deltas[i];

  // 2. Placement.
  for (let i = 0; i < n; i++) {
    const sel = state.selections[i] as Selection;
    if (sel.type !== "play-card" && sel.type !== "build-wonder" && sel.type !== "discard") continue;
    hands[i] = hands[i].filter((id) => id !== sel.cardId);
    if (sel.type === "play-card") {
      players[i].tableau.push(sel.cardId);
      if (sel.payment.kind === "free-build") players[i].freeBuildUsedThisAge = true;
      plays.push({ playerIndex: i, action: "play-card", cardId: sel.cardId, payment: sel.payment });
    } else if (sel.type === "build-wonder") {
      players[i].stagesBuilt += 1;
      plays.push({
        playerIndex: i,
        action: "build-wonder",
        cardId: sel.cardId,
        payment: sel.payment,
      });
    } else {
      discard.push(sel.cardId);
      players[i].coins += DISCARD_COIN_VALUE;
      plays.push({ playerIndex: i, action: "discard", cardId: sel.cardId });
    }
  }

  // 3. Instant coin effects, evaluated on the post-placement board.
  const mid: GameState = { ...state, players, hands, discard };
  for (let i = 0; i < n; i++) {
    const sel = state.selections[i] as Selection;
    if (sel.type === "play-card") {
      for (const effect of getCardDef(cardIdName(sel.cardId)).effects) {
        players[i].coins += instantCoins(effect, mid, i);
      }
    } else if (sel.type === "build-wonder") {
      const stage = getWonderDef(players[i].wonderId).sides[players[i].side].stages[
        players[i].stagesBuilt - 1
      ];
      for (const effect of stage.effects) {
        players[i].coins += instantCoins(effect, mid, i);
        if (effect.kind === "play-discarded") {
          halikarnassos.push({ kind: "halikarnassos", playerIndex: i });
        }
      }
    }
  }

  // 4. Turn 6: leftover cards are discarded, except for a Babylon-B player
  //    with the 7th-card stage built, who resolves it as a pending action
  //    (before any Halikarnassos pick, so its discard is available).
  const pendingQueue: PendingAction[] = [];
  if (state.turn === TURNS_PER_AGE) {
    for (let i = 0; i < n; i++) {
      const leftover = hands[i][0];
      if (leftover === undefined) continue;
      if (hasBuiltStageEffect(players[i], "play-seventh-card")) {
        pendingQueue.push({ kind: "babylon-seventh", playerIndex: i });
      } else {
        discard.push(leftover);
        hands[i] = [];
      }
    }
  }
  pendingQueue.push(...halikarnassos);

  const next: GameState = {
    ...state,
    players,
    hands,
    discard,
    selections: state.selections.map(() => null),
    pendingQueue,
    lastRevealed: plays,
    phase: "pending",
    actionLog: [...state.actionLog, { type: "reveal", age: state.age, turn: state.turn, plays }],
  };

  return pendingQueue.length > 0 ? next : finishTurn(next);
}

// ── Pending actions (Babylon 7th card, Halikarnassos discard build) ────────

export function applyPendingAction(
  state: GameState,
  playerIndex: number,
  action: SevenWondersAction,
): GameState {
  if (state.phase !== "pending") throw new Error("Not in pending phase");
  const pending = state.pendingQueue[0];
  if (!pending || pending.playerIndex !== playerIndex) {
    throw new Error("Not this player's pending action");
  }
  assertLegal(state, playerIndex, action);

  const players = clonePlayers(state.players);
  let hands = state.hands;
  let discard = [...state.discard];
  const pendingQueue = state.pendingQueue.slice(1);
  const player = players[playerIndex];
  let play: RevealedPlay | null = null;

  if (pending.kind === "halikarnassos") {
    if (action.type === "pick-discard") {
      discard = discard.filter((id) => id !== action.cardId);
      player.tableau.push(action.cardId);
      const mid: GameState = { ...state, players, discard };
      for (const effect of getCardDef(cardIdName(action.cardId)).effects) {
        player.coins += instantCoins(effect, mid, playerIndex);
      }
      play = { playerIndex, action: "play-card", cardId: action.cardId };
    }
  } else if (action.type === "play-seventh") {
    const inner = action.action;
    hands = state.hands.map((h, i) => (i === playerIndex ? [] : [...h]));

    if (inner.type === "discard") {
      discard.push(inner.cardId);
      player.coins += DISCARD_COIN_VALUE;
      play = { playerIndex, action: "discard", cardId: inner.cardId };
    } else {
      if (inner.payment.kind === "resources") {
        const n = state.playerCount;
        player.coins -= inner.payment.left + inner.payment.right;
        players[leftOf(playerIndex, n)].coins += inner.payment.left;
        players[rightOf(playerIndex, n)].coins += inner.payment.right;
      }
      if (inner.type === "play-card") {
        if (inner.payment.kind === "resources") {
          player.coins -= getCardDef(cardIdName(inner.cardId)).cost.coins ?? 0;
        }
        if (inner.payment.kind === "free-build") player.freeBuildUsedThisAge = true;
        player.tableau.push(inner.cardId);
        const mid: GameState = { ...state, players, hands, discard };
        for (const effect of getCardDef(cardIdName(inner.cardId)).effects) {
          player.coins += instantCoins(effect, mid, playerIndex);
        }
      } else {
        const side = getWonderDef(player.wonderId).sides[player.side];
        const stage = side.stages[player.stagesBuilt];
        if (inner.payment.kind === "resources") player.coins -= stage.cost.coins ?? 0;
        player.stagesBuilt += 1;
        const mid: GameState = { ...state, players, hands, discard };
        for (const effect of stage.effects) {
          player.coins += instantCoins(effect, mid, playerIndex);
          if (effect.kind === "play-discarded") {
            pendingQueue.push({ kind: "halikarnassos", playerIndex });
          }
        }
      }
      play = {
        playerIndex,
        action: inner.type,
        cardId: inner.cardId,
        payment: inner.payment,
      };
    }
  }

  const next: GameState = {
    ...state,
    players,
    hands,
    discard,
    pendingQueue,
    phase: "pending",
    actionLog: [
      ...state.actionLog,
      {
        type: "pending",
        age: state.age,
        turn: state.turn,
        playerIndex,
        kind: pending.kind,
        play,
      },
    ],
  };

  return pendingQueue.length > 0 ? next : finishTurn(next);
}

// ── Turn / age transitions ──────────────────────────────────────────────────

function finishTurn(state: GameState): GameState {
  if (state.turn < TURNS_PER_AGE) {
    const n = state.playerCount;
    const dir = passDirection(state.age);
    const hands: GameState["hands"] = state.hands.map(() => []);
    state.hands.forEach((hand, i) => {
      const target = dir === "left" ? leftOf(i, n) : rightOf(i, n);
      hands[target] = hand;
    });
    return { ...state, hands, turn: state.turn + 1, phase: "selecting" };
  }
  return advanceAge(resolveMilitary(state));
}

/** End-of-age conflicts: each adjacent pair compares shields once. */
export function resolveMilitary(state: GameState): GameState {
  const n = state.playerCount;
  const players = clonePlayers(state.players);
  const shields = players.map(countShields);
  const victory = MILITARY_VICTORY_POINTS[state.age];
  const outcomes: MilitaryOutcome[] = players.map((_, i) => ({ playerIndex: i, tokens: [] }));

  for (let i = 0; i < n; i++) {
    const j = leftOf(i, n);
    if (shields[i] > shields[j]) {
      players[i].militaryTokens.push(victory);
      players[j].militaryTokens.push(MILITARY_DEFEAT_POINTS);
      outcomes[i].tokens.push(victory);
      outcomes[j].tokens.push(MILITARY_DEFEAT_POINTS);
    } else if (shields[j] > shields[i]) {
      players[j].militaryTokens.push(victory);
      players[i].militaryTokens.push(MILITARY_DEFEAT_POINTS);
      outcomes[j].tokens.push(victory);
      outcomes[i].tokens.push(MILITARY_DEFEAT_POINTS);
    } else {
      outcomes[i].tokens.push(0);
      outcomes[j].tokens.push(0);
    }
  }

  return {
    ...state,
    players,
    actionLog: [...state.actionLog, { type: "military", age: state.age, outcomes }],
  };
}

export function advanceAge(state: GameState): GameState {
  if (state.age === 3) {
    const breakdowns = scoreFinal(state);
    const totals = breakdowns.map((b) => b.total);
    const winner = determineWinner(state, breakdowns);
    return {
      ...state,
      phase: "game-over",
      actionLog: [...state.actionLog, { type: "game-end", totals, winner }],
    };
  }

  const age = (state.age + 1) as Age;
  const hands = dealHands(state.ageDecks[age as 2 | 3], state.playerCount);
  const players = state.players.map((p) => ({ ...p, freeBuildUsedThisAge: false }));
  return {
    ...state,
    age,
    turn: 1,
    phase: "selecting",
    players,
    hands,
    actionLog: [...state.actionLog, { type: "age-start", age }],
  };
}
