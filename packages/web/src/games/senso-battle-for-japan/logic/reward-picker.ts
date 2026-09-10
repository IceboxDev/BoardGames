import type { Clan, RewardKind } from "@boardgames/core/games/senso-battle-for-japan/types";

// The reward picker is a tiny pure state machine so the board's click flow is
// unit-testable without rendering: kind → (Emperor: clan) → target, with the
// two-step Balance source → destination in the middle. Aggression has no clan
// step — the Emperor strikes as nobody and its action carries no `as` — so the
// Emperor-ness of those steps travels as a flag instead.

export type TargetKind = "determination" | "aggression" | "bonus";
/** The rewards that move or place a cube of one clan (the Emperor names it). */
export type CubeKind = Exclude<RewardKind, "aggression">;

export type PickerState =
  | { step: "idle" }
  | { step: "kind"; emperor?: true }
  | { step: "clan"; kind: CubeKind }
  | { step: "target"; kind: "determination"; as?: Clan }
  | { step: "target"; kind: "aggression"; emperor?: true }
  | { step: "target"; kind: "bonus" }
  | { step: "balance-source"; as?: Clan }
  | { step: "balance-dest"; as?: Clan; from: { region: number; square: number } };

export type PickerEvent =
  | { type: "reset"; phase: "rewards" | "bonus" | "other"; needsClan: boolean }
  | { type: "pick-kind"; kind: RewardKind }
  | { type: "pick-clan"; clan: Clan }
  | { type: "pick-source"; region: number; square: number }
  | { type: "back" }
  | { type: "cancel" };

export const IDLE: PickerState = { step: "idle" };

function kindStep(emperor: boolean): PickerState {
  return emperor ? { step: "kind", emperor: true } : { step: "kind" };
}

function afterClan(kind: CubeKind, as: Clan | undefined): PickerState {
  if (kind === "balance") {
    return as === undefined ? { step: "balance-source" } : { step: "balance-source", as };
  }
  return as === undefined
    ? { step: "target", kind: "determination" }
    : { step: "target", kind: "determination", as };
}

export function initialPicker(
  phase: "rewards" | "bonus" | "other",
  needsClan: boolean,
): PickerState {
  if (phase === "bonus") return { step: "target", kind: "bonus" };
  if (phase === "rewards") return kindStep(needsClan);
  return IDLE;
}

/** Whether the picker is the Emperor's: it names a clan for cube moves and strikes as nobody. */
export function isEmperorPicker(state: PickerState): boolean {
  switch (state.step) {
    case "idle":
      return false;
    case "clan":
      return true;
    case "kind":
      return state.emperor === true;
    case "target":
      if (state.kind === "aggression") return state.emperor === true;
      return state.kind === "determination" && state.as !== undefined;
    default:
      return state.as !== undefined;
  }
}

export function reducePicker(state: PickerState, event: PickerEvent): PickerState {
  switch (event.type) {
    case "reset":
      return initialPicker(event.phase, event.needsClan);
    case "pick-kind": {
      if (state.step === "idle") return state;
      if (state.step === "target" && state.kind === "bonus") return state;
      const emperor = isEmperorPicker(state);
      if (event.kind === "aggression") {
        return emperor
          ? { step: "target", kind: "aggression", emperor: true }
          : { step: "target", kind: "aggression" };
      }
      return emperor ? { step: "clan", kind: event.kind } : afterClan(event.kind, undefined);
    }
    case "pick-clan":
      if (state.step !== "clan") return state;
      return afterClan(state.kind, event.clan);
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
          return state.as === undefined ? { step: "kind" } : { step: "clan", kind: "balance" };
        case "target":
          if (state.kind === "bonus") return state;
          if (state.kind === "aggression") return kindStep(state.emperor === true);
          return state.as === undefined
            ? { step: "kind" }
            : { step: "clan", kind: "determination" };
        case "clan":
          return kindStep(true);
        default:
          return state;
      }
    case "cancel":
      if (state.step === "idle") return state;
      if (state.step === "target" && state.kind === "bonus") return state;
      return kindStep(isEmperorPicker(state));
  }
}

/** The clan the picker is acting as (undefined for a clan seat, and for a strike). */
export function pickerAs(state: PickerState): Clan | undefined {
  return "as" in state ? state.as : undefined;
}
