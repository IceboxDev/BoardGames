import type { GameState } from "../types";
import type { FastState } from "./types";
import {
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
  TOTAL_CARDS,
} from "./types";

const PHASE_MAP: Record<string, number> = {
  "action-phase": PH_ACTION,
  "nope-window": PH_NOPE,
  "choosing-target": PH_CHOOSING_TARGET,
  "resolving-favor": PH_FAVOR,
  "choosing-card-name": PH_CHOOSING_NAME,
  "choosing-discard": PH_CHOOSING_DISCARD,
  peeking: PH_PEEKING,
  exploding: PH_EXPLODING,
  reinserting: PH_REINSERTING,
  "game-over": PH_GAME_OVER,
};

function shuffleArray(arr: number[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Build a FastState from a GameState, randomizing hidden information
 * from the perspective of `observerIndex`.
 *
 * The observer knows:
 * - Their own hand
 * - The discard pile (public)
 * - Other players' hand sizes (public)
 * - Which players are alive (public)
 *
 * The observer does NOT know:
 * - Other players' specific hand contents
 * - The order of the draw pile
 */
export function determinize(state: GameState, observerIndex: number): FastState {
  const knownIds = new Set<number>();

  for (const c of state.players[observerIndex].hand) knownIds.add(c.id);
  for (const c of state.discardPile) knownIds.add(c.id);

  const unknownIds: number[] = [];
  for (let id = 0; id < TOTAL_CARDS; id++) {
    if (!knownIds.has(id)) unknownIds.push(id);
  }
  shuffleArray(unknownIds);

  let ptr = 0;
  const hands: number[][] = [];
  for (let i = 0; i < state.players.length; i++) {
    if (i === observerIndex) {
      hands.push(state.players[i].hand.map((c) => c.id));
    } else {
      const size = state.players[i].hand.length;
      hands.push(unknownIds.slice(ptr, ptr + size));
      ptr += size;
    }
  }

  const drawPile = unknownIds.slice(ptr);

  return {
    drawPile,
    discardPile: state.discardPile.map((c) => c.id),
    hands,
    alive: state.players.map((p) => p.alive),
    currentPlayer: state.currentPlayerIndex,
    turnsRemaining: state.turnsRemaining,
    phase: PHASE_MAP[state.phase] ?? PH_ACTION,
    gameOver: state.phase === "game-over",
    winner: state.winner ?? -1,
    playerCount: state.players.length,
    nopeSourcePlayer: state.nopeWindow?.sourcePlayerIndex ?? -1,
    nopeEffectType: -1,
    nopeChainLength: state.nopeWindow?.nopeChain.length ?? 0,
    nopePollingPlayer: state.nopeWindow?.currentPollingIndex ?? -1,
    nopePassed: state.players.map(
      (_, i) => state.nopeWindow?.passedPlayerIndices.includes(i) ?? false,
    ),
    favorFrom: state.favorContext?.fromPlayer ?? -1,
    favorTarget: state.favorContext?.targetPlayer ?? -1,
    stealFrom: state.stealContext?.fromPlayer ?? -1,
    stealTarget: state.stealContext?.targetPlayer ?? -1,
    stealIsNamed: state.stealContext?.isNamedSteal ?? false,
    explodingPlayer: state.explosionContext?.playerIndex ?? -1,
    explodingCardId: state.explosionContext?.kittenCard.id ?? -1,
  };
}

/**
 * Re-determinize a FastState in-place by reshuffling hidden cards
 * (other players' hands + draw pile) from the observer's perspective.
 */
export function redeterminize(s: FastState, observerIndex: number): void {
  const pool: number[] = [...s.drawPile];
  for (let i = 0; i < s.playerCount; i++) {
    if (i !== observerIndex && s.alive[i]) {
      pool.push(...s.hands[i]);
    }
  }

  shuffleArray(pool);

  let ptr = 0;
  for (let i = 0; i < s.playerCount; i++) {
    if (i !== observerIndex && s.alive[i]) {
      const size = s.hands[i].length;
      s.hands[i] = pool.slice(ptr, ptr + size);
      ptr += size;
    }
  }

  s.drawPile = pool.slice(ptr);
}
