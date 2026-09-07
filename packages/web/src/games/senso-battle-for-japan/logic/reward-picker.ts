import type { Clan, RewardKind } from "@boardgames/core/games/senso-battle-for-japan/types";

// The reward picker is a tiny pure state machine so the board's click flow is
// unit-testable without rendering: (Emperor: clan) → kind → target, with the
// two-step Balance source → destination in the middle.

export type TargetKind = "determination" | "aggression" | "bonus";

export type PickerState =
  | { step: "idle" }
  | { step: "clan" }
  | { step: "kind"; as?: Clan }
  | { step: "target"; kind: TargetKind; as?: Clan }
  | { step: "balance-source"; as?: Clan }
  | { step: "balance-dest"; as?: Clan; from: { region: number; square: number } };

export type PickerEvent =
  | { type: "reset"; phase: "rewards" | "bonus" | "other"; needsClan: boolean }
  | { type: "pick-clan"; clan: Clan }
  | { type: "pick-kind"; kind: RewardKind }
  | { type: "pick-source"; region: number; square: number }
  | { type: "back" }
  | { type: "cancel" };

export const IDLE: PickerState = { step: "idle" };

export function initialPicker(
  phase: "rewards" | "bonus" | "other",
  needsClan: boolean,
): PickerState {
  if (phase === "bonus") return { step: "target", kind: "bonus" };
  if (phase === "rewards") return needsClan ? { step: "clan" } : { step: "kind" };
  return IDLE;
}

export function reducePicker(state: PickerState, event: PickerEvent): PickerState {
  switch (event.type) {
    case "reset":
      return initialPicker(event.phase, event.needsClan);
    case "pick-clan":
      return { step: "kind", as: event.clan };
    case "pick-kind": {
      if (state.step === "idle" || state.step === "clan") return state;
      const as = state.as;
      if (event.kind === "balance")
        return as === undefined ? { step: "balance-source" } : { step: "balance-source", as };
      return as === undefined
        ? { step: "target", kind: event.kind }
        : { step: "target", kind: event.kind, as };
    }
    case "pick-source":
      if (state.step !== "balance-source" && state.step !== "balance-dest") return state;
      return state.as === undefined
        ? { step: "balance-dest", from: { region: event.region, square: event.square } }
        : {
            step: "balance-dest",
            as: state.as,
            from: { region: event.region, square: event.square },
          };
    case "back":
      switch (state.step) {
        case "balance-dest":
          return state.as === undefined
            ? { step: "balance-source" }
            : { step: "balance-source", as: state.as };
        case "balance-source":
        case "target":
          if (state.step === "target" && state.kind === "bonus") return state;
          return state.as === undefined ? { step: "kind" } : { step: "kind", as: state.as };
        case "kind":
          return state.as === undefined ? state : { step: "clan" };
        default:
          return state;
      }
    case "cancel":
      if (state.step === "idle") return state;
      if (state.step === "target" && state.kind === "bonus") return state;
      return state.step !== "clan" && state.as !== undefined ? { step: "clan" } : { step: "kind" };
  }
}

/** The clan the picker is acting as (undefined for a clan seat). */
export function pickerAs(state: PickerState): Clan | undefined {
  return state.step === "idle" || state.step === "clan" ? undefined : state.as;
}
