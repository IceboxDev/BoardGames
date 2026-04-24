import { buildFullDeck } from "./deck";
import { getActiveDecider } from "./rules";
import type {
  Action,
  ActionLogEntry,
  AIStrategyId,
  Card,
  CardType,
  GamePhase,
  GameState,
  PlayerType,
} from "./types";
import { CARD_LABELS } from "./types";

// ── Replay Format ──────────────────────────────────────────────────────────

export const REPLAY_FORMAT_VERSION = 1;

/** Compact state snapshot using card IDs only. */
export interface EKReplayStateSnapshot {
  drawPile: number[];
  discardPile: number[];
  hands: number[][];
  alive: boolean[];
  currentPlayerIndex: number;
  turnsRemaining: number;
  turnCount: number;
  phase: GamePhase;
  winner: number | null;
}

/** Serializable form of the Action discriminated union. */
export interface EKReplayAction {
  type: string;
  cardId?: number;
  cardIds?: number[];
  targetIndex?: number;
  cardType?: string;
  position?: number;
}

/** One step in the replay log. */
export interface EKReplayStep {
  stepIndex: number;
  player: number;
  state: EKReplayStateSnapshot;
  action?: EKReplayAction;
  description: string;
}

/** Full replay log for one game. */
export interface EKGameReplayLog {
  formatVersion: 1;
  seed: number;
  playerCount: number;
  strategies: (string | null)[];
  steps: EKReplayStep[];
  actionLog: ActionLogEntry[];
  scoreA: number;
  scoreB: number;
  winner: number | null;
  turnCount: number;
}

// ── Card ID Lookup ─────────────────────────────────────────────────────────

const CARD_LOOKUP: Card[] = buildFullDeck();

export function cardIdToCard(id: number): Card {
  return CARD_LOOKUP[id];
}

// ── Snapshot Conversion ────────────────────────────────────────────────────

export function gameStateToSnapshot(state: GameState): EKReplayStateSnapshot {
  return {
    drawPile: state.drawPile.map((c) => c.id),
    discardPile: state.discardPile.map((c) => c.id),
    hands: state.players.map((p) => p.hand.map((c) => c.id)),
    alive: state.players.map((p) => p.alive),
    currentPlayerIndex: state.currentPlayerIndex,
    turnsRemaining: state.turnsRemaining,
    turnCount: state.turnCount,
    phase: state.phase,
    winner: state.winner,
  };
}

/** Reconstitute a full GameState from a compact snapshot (for replay viewer). */
export function snapshotToGameState(
  snapshot: EKReplayStateSnapshot,
  playerTypes: PlayerType[],
  strategies: (string | null)[],
): GameState {
  return {
    phase: snapshot.phase,
    drawPile: snapshot.drawPile.map(cardIdToCard),
    discardPile: snapshot.discardPile.map(cardIdToCard),
    players: snapshot.hands.map((hand, i) => ({
      index: i,
      type: playerTypes[i] ?? "ai",
      hand: hand.map(cardIdToCard),
      alive: snapshot.alive[i],
      aiStrategy: (strategies[i] as AIStrategyId | null) ?? undefined,
    })),
    currentPlayerIndex: snapshot.currentPlayerIndex,
    turnsRemaining: snapshot.turnsRemaining,
    turnCount: snapshot.turnCount,
    nopeWindow: null,
    favorContext: null,
    stealContext: null,
    discardPickContext: null,
    peekContext: null,
    explosionContext: null,
    winner: snapshot.winner,
  };
}

// ── Action Serialization ───────────────────────────────────────────────────

export function actionToReplayAction(action: Action): EKReplayAction {
  switch (action.type) {
    case "play-card":
      return { type: action.type, cardId: action.cardId };
    case "play-combo":
      return { type: action.type, cardIds: action.cardIds };
    case "end-action-phase":
      return { type: action.type };
    case "nope":
      return { type: action.type, cardId: action.cardId };
    case "pass-nope":
      return { type: action.type };
    case "select-target":
      return { type: action.type, targetIndex: action.targetIndex };
    case "give-card":
      return { type: action.type, cardId: action.cardId };
    case "name-card-type":
      return { type: action.type, cardType: action.cardType };
    case "select-discard-card":
      return { type: action.type, cardId: action.cardId };
    case "acknowledge-peek":
      return { type: action.type };
    case "play-defuse":
      return { type: action.type, cardId: action.cardId };
    case "reinsert-kitten":
      return { type: action.type, position: action.position };
    case "skip-defuse":
      return { type: action.type };
  }
}

// ── Human-Readable Description ─────────────────────────────────────────────

function playerLabel(state: GameState, index: number): string {
  const p = state.players[index];
  return p?.type === "human" ? "You" : `Player ${index}`;
}

function cardLabel(cardId: number, state: GameState): string {
  for (const p of state.players) {
    const c = p.hand.find((h) => h.id === cardId);
    if (c) return CARD_LABELS[c.type];
  }
  const disc = state.discardPile.find((c) => c.id === cardId);
  if (disc) return CARD_LABELS[disc.type];
  return `card #${cardId}`;
}

function cardTypeFromId(cardId: number, state: GameState): CardType | null {
  for (const p of state.players) {
    const c = p.hand.find((h) => h.id === cardId);
    if (c) return c.type;
  }
  const disc = state.discardPile.find((c) => c.id === cardId);
  if (disc) return disc.type;
  return null;
}

/** Produce a human-readable description of an action in context. */
export function describeAction(action: Action, state: GameState): string {
  const decider = getActiveDecider(state);
  const who = playerLabel(state, decider);

  switch (action.type) {
    case "play-card":
      return `${who} played ${cardLabel(action.cardId, state)}`;
    case "play-combo": {
      const types = action.cardIds
        .map((id) => cardTypeFromId(id, state))
        .filter((t): t is CardType => t !== null)
        .map((t) => CARD_LABELS[t]);
      return `${who} played combo: ${types.join(", ")}`;
    }
    case "end-action-phase":
      return `${who} drew a card`;
    case "nope":
      return `${who} played Nope`;
    case "pass-nope":
      return `${who} passed on Nope`;
    case "select-target":
      return `${who} targeted ${playerLabel(state, action.targetIndex)}`;
    case "give-card":
      return `${who} gave ${cardLabel(action.cardId, state)}`;
    case "name-card-type":
      return `${who} named ${CARD_LABELS[action.cardType]}`;
    case "select-discard-card":
      return `${who} picked ${cardLabel(action.cardId, state)} from discard`;
    case "acknowledge-peek":
      return `${who} finished peeking`;
    case "play-defuse":
      return `${who} played Defuse`;
    case "reinsert-kitten":
      return `${who} reinserted kitten at position ${action.position}`;
    case "skip-defuse":
      return `${who} has no defuse — eliminated!`;
  }
}

// ── Build Final Log ────────────────────────────────────────────────────────

export function buildGameLog(opts: {
  seed: number;
  playerCount: number;
  strategies: (string | null)[];
  steps: EKReplayStep[];
  actionLog: ActionLogEntry[];
  winner: number | null;
  turnCount: number;
}): EKGameReplayLog {
  return {
    formatVersion: 1,
    seed: opts.seed,
    playerCount: opts.playerCount,
    strategies: opts.strategies,
    steps: opts.steps,
    actionLog: opts.actionLog,
    scoreA: opts.winner === 0 ? 1 : 0,
    scoreB: opts.winner === 1 ? 1 : 0,
    winner: opts.winner,
    turnCount: opts.turnCount,
  };
}
