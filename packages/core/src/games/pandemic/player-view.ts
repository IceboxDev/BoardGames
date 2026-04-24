import type { DiseaseColor, GameState, InfectionCard, PlayerCard } from "./types";

// ---------------------------------------------------------------------------
// Player-view redaction
// ---------------------------------------------------------------------------
//
// Pandemic is a co-op game: every player's hand is intentionally visible to
// every other player (that's how the table plays out in-person). But the
// *deck orderings* are hidden — a client that inspected the raw GameState
// could read the top of the infection deck (next cities to be infected) or
// the player deck (when the next epidemic lands, which card the active
// player draws next), which breaks the entire game.
//
// `getPublicView` returns a redacted GameState that preserves hand visibility
// but zeroes out deck orderings. Deck *counts* are preserved because the
// rulebook exposes them, and the web UI already renders them.
//
// Special case: during the "forecast" phase, the active player has peeked
// at the top 6 infection cards and is reordering them. Those 6 are visible
// *to that player only* while the phase is active; they re-hide as soon as
// the reorder is committed.
// ---------------------------------------------------------------------------

/**
 * Sentinel city id inserted into redacted decks. It's intentionally not a
 * real city so any consumer that accidentally reads it will break loudly
 * rather than silently leak a legit-looking value.
 */
export const HIDDEN_CITY_ID = "__hidden__";
const HIDDEN_COLOR: DiseaseColor = "blue"; // value is a placeholder; consumers MUST NOT read it

function hiddenInfection(): InfectionCard {
  return { cityId: HIDDEN_CITY_ID, color: HIDDEN_COLOR };
}

function hiddenPlayerCard(): PlayerCard {
  return { kind: "city", cityId: HIDDEN_CITY_ID, color: HIDDEN_COLOR };
}

function redactInfectionDeck(deck: InfectionCard[]): InfectionCard[] {
  // Preserve length; the UI already reads `infectionDeck.length`. The card
  // contents are replaced with a sentinel — any code that tries to read
  // cityId or color gets a value it will not find in CITY_DATA.
  return deck.map(hiddenInfection);
}

function redactPlayerDeck(deck: PlayerCard[]): PlayerCard[] {
  return deck.map(hiddenPlayerCard);
}

/**
 * Build a redacted view of the game state for a specific player.
 *
 * What stays visible:
 *   - All player hands (co-op game)
 *   - Discard piles (already face-up)
 *   - Board state, cubes, stations, disease status
 *   - The current player's forecast peek (when in forecast phase)
 *
 * What gets redacted:
 *   - Infection deck ordering (only length preserved)
 *   - Player deck ordering (only length preserved)
 */
export function getPublicView(state: GameState, viewerPlayerId: number): GameState {
  const isForecastViewer =
    state.phase === "forecast" && viewerPlayerId === state.currentPlayerIndex;

  // During forecast, the active viewer sees the top-6 of the infection deck
  // (the rest stays hidden). Everyone else sees the full deck hidden.
  let infectionDeck: InfectionCard[];
  if (isForecastViewer) {
    const peekCount = Math.min(6, state.infectionDeck.length);
    infectionDeck = [
      ...state.infectionDeck.slice(0, peekCount),
      ...redactInfectionDeck(state.infectionDeck.slice(peekCount)),
    ];
  } else {
    infectionDeck = redactInfectionDeck(state.infectionDeck);
  }

  return {
    ...state,
    infectionDeck,
    playerDeck: redactPlayerDeck(state.playerDeck),
  };
}
