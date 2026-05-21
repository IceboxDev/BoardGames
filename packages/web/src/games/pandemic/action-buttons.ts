// Pure derivation of the action button list shown on the right-hand panel.
// Lifted from the canvas-era `action-panel-layer.ts` so the new HTML panel
// can render real <Button> elements while the logic stays testable.
//
// Buttons fall into two groups:
//   * "Always shown" — Drive, Direct, Charter, Shuttle, Build, Treat,
//     Share, Cure, Pass. These appear every turn; `enabled` reflects
//     whether the current state contains a matching legal action.
//   * "Conditional" — Ops Move (operations_expert), Dispatch (dispatcher),
//     Store Event (contingency_planner), Play Event (any role with an
//     event in hand). Insertion points are tuned so the button always
//     appears near its peers (movement buttons, event buttons).

import type { GameState, LegalAction } from "@boardgames/core/games/pandemic/types";

export type ActionKind =
  | "drive_ferry"
  | "direct_flight"
  | "charter_flight"
  | "shuttle_flight"
  | "build_station"
  | "treat_disease"
  | "share_give"
  | "discover_cure"
  | "ops_move"
  | "dispatcher_move_to_pawn"
  | "contingency_take"
  | "play_event"
  | "pass";

export interface ActionButton {
  label: string;
  actionKind: ActionKind;
  enabled: boolean;
}

/**
 * Derive the right-side action buttons for the current state. Returns an
 * empty array outside the actions phase — the panel as a whole hides then.
 */
export function deriveActionButtons(
  state: GameState,
  legal: readonly LegalAction[],
): ActionButton[] {
  if (state.phase !== "actions") return [];

  const legalKinds = new Set(legal.map((a) => a.kind));

  const buttons: ActionButton[] = [
    { label: "Drive / Ferry", actionKind: "drive_ferry", enabled: legalKinds.has("drive_ferry") },
    {
      label: "Direct Flight",
      actionKind: "direct_flight",
      enabled: legalKinds.has("direct_flight"),
    },
    {
      label: "Charter Flight",
      actionKind: "charter_flight",
      enabled: legalKinds.has("charter_flight"),
    },
    {
      label: "Shuttle Flight",
      actionKind: "shuttle_flight",
      enabled: legalKinds.has("shuttle_flight"),
    },
    {
      label: "Build Station",
      actionKind: "build_station",
      enabled: legalKinds.has("build_station"),
    },
    {
      label: "Treat Disease",
      actionKind: "treat_disease",
      enabled: legalKinds.has("treat_disease"),
    },
    {
      label: "Share Knowledge",
      actionKind: "share_give",
      enabled: legalKinds.has("share_give") || legalKinds.has("share_take"),
    },
    {
      label: "Discover Cure",
      actionKind: "discover_cure",
      enabled: legalKinds.has("discover_cure"),
    },
    { label: "Pass", actionKind: "pass", enabled: true },
  ];

  const player = state.players[state.currentPlayerIndex];

  // Insert role-specific movement options next to the other movement buttons
  // (after Shuttle Flight, before Build Station — index 4).
  if (player.role === "operations_expert" && legalKinds.has("ops_move")) {
    buttons.splice(4, 0, {
      label: "Ops Expert Move",
      actionKind: "ops_move",
      enabled: true,
    });
  }
  if (player.role === "dispatcher" && legalKinds.has("dispatcher_move_to_pawn")) {
    buttons.splice(4, 0, {
      label: "Dispatch to Pawn",
      actionKind: "dispatcher_move_to_pawn",
      enabled: true,
    });
  }

  // Contingency Planner can store an event from discard. Insert before Pass.
  if (player.role === "contingency_planner" && legalKinds.has("contingency_take")) {
    buttons.splice(buttons.length - 1, 0, {
      label: "Store Event",
      actionKind: "contingency_take",
      enabled: true,
    });
  }

  // Any role can play an event from hand (or the contingency-stored one).
  // Insert before Pass.
  const hasEvent = player.hand.some((c) => c.kind === "event") || state.contingencyCard !== null;
  if (hasEvent) {
    buttons.splice(buttons.length - 1, 0, {
      label: "Play Event",
      actionKind: "play_event",
      enabled: true,
    });
  }

  return buttons;
}
