// Pure helpers driving the city-click and action-button flows on the new
// SVG board. Lifted out of the canvas-era `useInteraction.ts` so the
// (state, click) → action mapping is straightforward to unit-test without
// rendering anything.
//
// The board exposes two interaction modes:
//   * "normal" — clicking a city tries to dispatch one of the three
//     concrete movement actions (drive/ferry, shuttle, direct).
//   * "select_destination" — entered when the user clicks an action button
//     whose legal action is "open" (charter_flight, ops_move). The next
//     city click on a legal destination resolves and dispatches the
//     action.

import type {
  DiseaseColor,
  GameAction,
  GameState,
  LegalAction,
  MetaAction,
} from "@boardgames/core/games/pandemic/types";
import { DISEASE_COLORS } from "@boardgames/core/games/pandemic/types";

/**
 * Action handler the board passes to children. Accepts both regular game
 * actions (move, treat, cure, …) and the two meta actions that bookend a
 * session (`start_game`, `reset`) — the Pandemic top-level component
 * intercepts the meta variants and routes them to `useGameShell` rather
 * than the in-game machine.
 */
export type GameDispatch = (action: GameAction | MetaAction) => void;

/** Open-action modes the UI puts the board into while the user picks a city. */
export type InteractionMode =
  | { kind: "normal" }
  | {
      kind: "select_destination";
      action: "charter_flight";
      destinations: ReadonlySet<string>;
    }
  | {
      kind: "select_destination";
      action: "ops_move";
      cardIdx: number;
      destinations: ReadonlySet<string>;
    };

/**
 * Given a city click, derive the action to dispatch (if any). In
 * "select_destination" mode we resolve the in-flight open action; in
 * "normal" mode we look up the first legal concrete movement to that
 * city. Returns null if no action is applicable.
 */
export function resolveCityClick(
  cityId: string,
  state: GameState,
  legal: readonly LegalAction[],
  mode: InteractionMode,
): GameAction | null {
  if (mode.kind === "select_destination") {
    if (!mode.destinations.has(cityId)) return null;
    if (mode.action === "charter_flight") return { kind: "charter_flight", to: cityId };
    return { kind: "ops_move", to: cityId, cardIdx: mode.cardIdx };
  }

  if (state.phase !== "actions") return null;

  const hand = state.players[state.currentPlayerIndex].hand;

  // Try drive/ferry first — most common movement so it dispatches without
  // the user having to pick a specific button.
  const drive = legal.find(
    (a): a is Extract<LegalAction, { kind: "drive_ferry" }> =>
      a.kind === "drive_ferry" && a.to === cityId,
  );
  if (drive) return drive;

  const shuttle = legal.find(
    (a): a is Extract<LegalAction, { kind: "shuttle_flight" }> =>
      a.kind === "shuttle_flight" && a.to === cityId,
  );
  if (shuttle) return shuttle;

  const direct = legal.find((a): a is Extract<LegalAction, { kind: "direct_flight" }> => {
    if (a.kind !== "direct_flight") return false;
    const card = hand[a.cardIdx];
    return card?.kind === "city" && card.cityId === cityId;
  });
  if (direct) return direct;

  return null;
}

/**
 * In normal mode the board glows every city the current player can move
 * to in one action — drive/ferry, shuttle, and direct combined. In
 * destination-pick mode it returns the open action's own destination set.
 *
 * Returning a fresh Set every call is fine; the consumer wraps this in a
 * `useMemo` so it only recomputes when legal actions change.
 */
export function deriveLegalDestinations(
  legal: readonly LegalAction[],
  hand: readonly { kind: string; cityId?: string }[],
  mode: InteractionMode,
): Set<string> {
  if (mode.kind === "select_destination") return new Set(mode.destinations);

  const destinations = new Set<string>();
  for (const action of legal) {
    if (action.kind === "drive_ferry") destinations.add(action.to);
    if (action.kind === "shuttle_flight") destinations.add(action.to);
    if (action.kind === "direct_flight") {
      const card = hand[action.cardIdx];
      if (card?.kind === "city" && card.cityId) destinations.add(card.cityId);
    }
  }
  return destinations;
}

/**
 * Click on Treat Disease when the city has multiple colors with cubes:
 * pick the color with the most cubes (matches the canvas-era behavior).
 */
export function pickTreatDiseaseAction(
  state: GameState,
  legal: readonly LegalAction[],
): Extract<GameAction, { kind: "treat_disease" }> | null {
  const treatActions = legal.filter(
    (a): a is Extract<LegalAction, { kind: "treat_disease" }> => a.kind === "treat_disease",
  );
  if (treatActions.length === 0) return null;
  if (treatActions.length === 1) return treatActions[0];

  const loc = state.players[state.currentPlayerIndex].location;
  let maxColor: DiseaseColor = "blue";
  let maxCount = 0;
  for (const color of DISEASE_COLORS) {
    if (state.cityCubes[loc][color] > maxCount) {
      maxCount = state.cityCubes[loc][color];
      maxColor = color;
    }
  }
  return { kind: "treat_disease", color: maxColor };
}
