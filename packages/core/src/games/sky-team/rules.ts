import { isLegalPlacement, placementsExhausted } from "./game-engine";
import { getSlotDef } from "./scenarios";
import {
  type DieValue,
  type PlayerIndex,
  type SkyTeamAction,
  type SkyTeamGameState,
  SLOT_IDS,
} from "./types";

function asAdjustedValue(value: DieValue, adjust: number): DieValue | null {
  const v = value + adjust;
  if (v < 1 || v > 6) return null;
  return v as DieValue;
}

/**
 * Enumerate every place-die action this player can legally take RIGHT NOW
 * (their dice, current slots, allowing all coffee adjustments that fit).
 */
export function getLegalPlacements(
  state: SkyTeamGameState,
  player: PlayerIndex,
): Extract<SkyTeamAction, { kind: "place-die" }>[] {
  if (state.phase !== "placement") return [];
  if (state.toPlace !== player) return [];
  const out: Extract<SkyTeamAction, { kind: "place-die" }>[] = [];
  const dice = state.unplacedDice[player];
  for (const die of dice) {
    const adjustRange =
      state.coffeeTokens === 0 ? [0] : range(-state.coffeeTokens, state.coffeeTokens);
    for (const adjust of adjustRange) {
      const value = asAdjustedValue(die.value, adjust);
      if (value == null) continue;
      for (const slot of SLOT_IDS) {
        if (isLegalPlacement(state, player, slot, value)) {
          out.push({ kind: "place-die", dieId: die.id, slot, coffeeAdjust: adjust });
        }
      }
    }
  }
  return out;
}

function range(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let i = lo; i <= hi; i++) out.push(i);
  return out;
}

/**
 * All actions either player could legally emit right now. Server uses this
 * (per-requester) to validate non-active actions like spend-reroll and
 * ready-to-roll.
 */
export function getLegalActionsForPlayer(
  state: SkyTeamGameState,
  player: PlayerIndex,
): SkyTeamAction[] {
  if (state.outcome != null) {
    // Game over — only the explicit acknowledgement is legal, both for
    // the player who just crashed and the partner. The machine sits in
    // `awaitingGameOver` until one of them clicks through.
    return [{ kind: "acknowledge-game-over" }];
  }
  if (state.phase === "briefing") {
    return state.readyForRoll[player] ? [] : [{ kind: "ready-to-roll" }];
  }
  if (state.phase === "placement") {
    const out: SkyTeamAction[] = [];
    if (placementsExhausted(state)) {
      // All 8 dice committed — the only thing either side can do is
      // confirm the round is done so engines/radio/round-wrap resolve.
      out.push({ kind: "end-round" });
      return out;
    }
    if (state.toPlace === player) {
      out.push(...getLegalPlacements(state, player));
    }
    if (state.rerollTokens > 0) {
      out.push({ kind: "spend-reroll", pilotDieIds: [], copilotDieIds: [] });
    }
    return out;
  }
  return [];
}

export { getSlotDef, isLegalPlacement };
