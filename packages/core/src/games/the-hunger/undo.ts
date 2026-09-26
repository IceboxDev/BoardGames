// ---------------------------------------------------------------------------
// Which actions a player may take back. Undo must never let anyone peek:
// an action is undoable only when it is of a harmless kind AND the state it
// produced shows no sign of luck or of newly seen information.
// ---------------------------------------------------------------------------

import { bonusDef } from "./content/bonus-tokens";
import { cardDef } from "./content/cards";
import { getActivePlayer } from "./rules";
import type { Action, GameState } from "./types";

/** Kinds of action that can reveal nothing by themselves. */
function harmlessKind(action: Action): boolean {
  switch (action.type) {
    case "move":
    case "mist":
    case "stay":
    case "push":
    case "hypnosis":
    case "digest":
    case "ready":
    case "end-manipulation":
    case "space": // a Chest or Crypt changes public state and is caught below
      return true;
    case "familiar": {
      // Kutya and Wiggles discard or digest; Ursa draws.
      const kind = cardDef(action.card).activated?.kind;
      return kind === "discard-for-col1-hunt" || kind === "digest-with-card";
    }
    case "use-bonus": {
      const kind = bonusDef(action.token).bonus.kind;
      return kind === "speed" || kind === "extra-hunt";
    }
    default:
      return false;
  }
}

/**
 * Whether `action`, which turned `before` into `after`, may be undone by the
 * player who made it. Belt and braces: besides the kind, nothing random may
 * have happened (the RNG, every deck and the Hunt deck are untouched), no
 * Chest, Crypt or Tavern changed, no Missions are being shown, and the same
 * player is still the one deciding on the same turn.
 */
export function isUndoable(before: GameState, after: GameState, action: Action): boolean {
  if (!harmlessKind(action)) return false;
  const player = before.current?.player;
  if (player === undefined || after.phase !== "play" || after.turn !== before.turn) return false;
  if (after.current?.player !== player || getActivePlayer(after) !== player) return false;
  if (after.current.missionPick) return false;
  if (after.rng !== before.rng || after.huntDeck.length !== before.huntDeck.length) return false;
  if (after.tavern.length !== before.tavern.length) return false;
  if (JSON.stringify(after.chests) !== JSON.stringify(before.chests)) return false;
  if (JSON.stringify(after.crypts) !== JSON.stringify(before.crypts)) return false;
  return after.players.every(
    (p, i) =>
      p.deck.length === before.players[i].deck.length &&
      p.hand.length === before.players[i].hand.length,
  );
}
