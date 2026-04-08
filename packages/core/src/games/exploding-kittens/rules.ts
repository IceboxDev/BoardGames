import type { Action, Card, CardType, GameState } from "./types";
import { canBeUsedInCombo } from "./types";

export function getActiveDecider(state: GameState): number {
  switch (state.phase) {
    case "action-phase":
    case "drawing":
    case "peeking":
    case "choosing-discard":
      return state.currentPlayerIndex;

    case "nope-window":
      return state.nopeWindow?.currentPollingIndex ?? 0;

    case "resolving-favor":
      return state.favorContext?.targetPlayer ?? 0;

    case "choosing-target":
    case "choosing-card-name":
      if (state.stealContext) return state.stealContext.fromPlayer;
      if (state.favorContext) return state.favorContext.fromPlayer;
      return state.currentPlayerIndex;

    case "exploding":
    case "reinserting":
      return state.explosionContext?.playerIndex ?? 0;

    case "game-over":
      return state.winner ?? 0;

    default:
      return state.currentPlayerIndex;
  }
}

export function getLegalActions(state: GameState): Action[] {
  switch (state.phase) {
    case "action-phase":
      return getActionPhaseActions(state);
    case "nope-window":
      return getNopeWindowActions(state);
    case "resolving-favor":
      return getFavorActions(state);
    case "choosing-target":
      return getTargetActions(state);
    case "choosing-card-name":
      return getCardNameActions();
    case "choosing-discard":
      return getDiscardPickActions(state);
    case "peeking":
      return [{ type: "acknowledge-peek" }];
    case "exploding":
      return getExplosionActions(state);
    case "reinserting":
      return getReinsertionActions(state);
    case "game-over":
      return [];
    default:
      return [];
  }
}

function getActionPhaseActions(state: GameState): Action[] {
  const player = state.players[state.currentPlayerIndex];
  const actions: Action[] = [];

  for (const card of player.hand) {
    if (
      card.type === "attack" ||
      card.type === "skip" ||
      card.type === "favor" ||
      card.type === "shuffle" ||
      card.type === "see-the-future"
    ) {
      actions.push({ type: "play-card", cardId: card.id });
    }
    // Nope can only be played reactively (in nope-window), not proactively
    // Defuse can only be played reactively (in exploding phase)
    // Exploding Kitten is never voluntarily played
  }

  for (const combo of getValidCombos(player.hand)) {
    actions.push({ type: "play-combo", cardIds: combo.cardIds });
  }

  actions.push({ type: "end-action-phase" });

  return actions;
}

function getNopeWindowActions(state: GameState): Action[] {
  if (!state.nopeWindow) throw new Error("nopeWindow must exist in nope-window phase");
  const nw = state.nopeWindow;
  const player = state.players[nw.currentPollingIndex];
  const actions: Action[] = [{ type: "pass-nope" }];

  for (const card of player.hand) {
    if (card.type === "nope") {
      actions.push({ type: "nope", cardId: card.id });
    }
  }

  return actions;
}

function getFavorActions(state: GameState): Action[] {
  const targetPlayer = state.favorContext?.targetPlayer;
  if (targetPlayer === undefined) return [];
  const target = state.players[targetPlayer];
  return target.hand.map((card: Card) => ({ type: "give-card", cardId: card.id }));
}

function getTargetActions(state: GameState): Action[] {
  const decider = state.stealContext
    ? state.stealContext.fromPlayer
    : state.favorContext?.fromPlayer;

  return state.players
    .filter((p) => p.alive && p.index !== decider && p.hand.length > 0)
    .map((p) => ({ type: "select-target", targetIndex: p.index }));
}

function getCardNameActions(): Action[] {
  const nameable: CardType[] = [
    "defuse",
    "attack",
    "skip",
    "favor",
    "shuffle",
    "see-the-future",
    "nope",
    "tacocat",
    "cattermelon",
    "potato-cat",
    "beard-cat",
    "rainbow-ralphing-cat",
  ];
  return nameable.map((ct) => ({ type: "name-card-type", cardType: ct }));
}

function getDiscardPickActions(state: GameState): Action[] {
  return state.discardPile.map((card) => ({
    type: "select-discard-card",
    cardId: card.id,
  }));
}

function getExplosionActions(state: GameState): Action[] {
  const playerIndex = state.explosionContext?.playerIndex;
  if (playerIndex === undefined) return [{ type: "skip-defuse" }];
  const player = state.players[playerIndex];
  const defuses = player.hand.filter((c: Card) => c.type === "defuse");

  if (defuses.length > 0) {
    return defuses.map((c: Card) => ({ type: "play-defuse", cardId: c.id }));
  }
  return [{ type: "skip-defuse" }];
}

function getReinsertionActions(state: GameState): Action[] {
  const positions: Action[] = [];
  for (let i = 0; i <= state.drawPile.length; i++) {
    positions.push({ type: "reinsert-kitten", position: i });
  }
  return positions;
}

// ── Combo Validation ────────────────────────────────────────────────────────

export interface ComboInfo {
  cardIds: number[];
  comboType: "pair" | "triple" | "five-different";
}

export function getValidCombos(hand: Card[]): ComboInfo[] {
  const combos: ComboInfo[] = [];
  const comboEligible = hand.filter((c) => canBeUsedInCombo(c.type));

  const byType = new Map<CardType, Card[]>();
  for (const card of comboEligible) {
    const list = byType.get(card.type) ?? [];
    list.push(card);
    byType.set(card.type, list);
  }

  for (const [, cards] of byType) {
    if (cards.length >= 2) {
      combos.push({
        cardIds: [cards[0].id, cards[1].id],
        comboType: "pair",
      });
    }
    if (cards.length >= 3) {
      combos.push({
        cardIds: [cards[0].id, cards[1].id, cards[2].id],
        comboType: "triple",
      });
    }
  }

  if (byType.size >= 5) {
    const types = Array.from(byType.entries());
    const fiveIds = types.slice(0, 5).map(([, cards]) => cards[0].id);
    combos.push({ cardIds: fiveIds, comboType: "five-different" });
  }

  return combos;
}
