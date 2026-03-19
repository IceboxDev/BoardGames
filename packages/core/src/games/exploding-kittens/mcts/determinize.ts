import { shuffleInPlace } from "../deck";
import type { Card, GameState } from "../types";

/**
 * Build a GameState from another GameState, randomizing hidden information
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
 *
 * The returned state has no actionLog (MCTS doesn't need it).
 */
export function determinize(state: GameState, observerIndex: number): GameState {
  const unknownPool: Card[] = [];
  for (const p of state.players) {
    if (p.index !== observerIndex && p.alive) {
      unknownPool.push(...p.hand);
    }
  }
  unknownPool.push(...state.drawPile);
  shuffleInPlace(unknownPool);

  let ptr = 0;
  const players = state.players.map((p) => {
    if (p.index === observerIndex || !p.alive) {
      return { ...p, hand: p.hand.slice() };
    }
    const size = p.hand.length;
    const hand = unknownPool.slice(ptr, ptr + size);
    ptr += size;
    return { ...p, hand };
  });

  return {
    phase: state.phase,
    drawPile: unknownPool.slice(ptr),
    discardPile: state.discardPile.slice(),
    players,
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
    peekContext: null,
    explosionContext: state.explosionContext ? { ...state.explosionContext } : null,
    winner: state.winner,
  };
}

/**
 * Re-determinize a GameState in-place by reshuffling hidden cards
 * (other players' hands + draw pile) from the observer's perspective.
 */
export function redeterminize(state: GameState, observerIndex: number): void {
  const pool: Card[] = [...state.drawPile];
  for (const p of state.players) {
    if (p.index !== observerIndex && p.alive) {
      pool.push(...p.hand);
    }
  }

  shuffleInPlace(pool);

  let ptr = 0;
  for (const p of state.players) {
    if (p.index !== observerIndex && p.alive) {
      const size = p.hand.length;
      p.hand = pool.slice(ptr, ptr + size);
      ptr += size;
    }
  }

  state.drawPile = pool.slice(ptr);
}
