import { z } from "zod";
import type { ScenarioConfig, SlotDef, SlotId } from "./types";

/**
 * Per-slot static definitions that hold for the base game across all
 * scenarios. Per-scenario overrides may layer on top via
 * `ScenarioConfig.slotOverrides`.
 *
 * Number constraints for landing-gear, flaps, and brakes are taken from
 * the base-game control panel. The exact numerics for landing-gear and
 * flaps are placeholders that should be verified against the printed
 * panel art on first build pass.
 */
export const BASE_SLOT_DEFS: Record<SlotId, SlotDef> = {
  "pilot-axis": { id: "pilot-axis", eligibility: "pilot", mandatory: true },
  "pilot-engine": { id: "pilot-engine", eligibility: "pilot", mandatory: true },
  "pilot-radio": { id: "pilot-radio", eligibility: "pilot" },
  "copilot-axis": { id: "copilot-axis", eligibility: "copilot", mandatory: true },
  "copilot-engine": { id: "copilot-engine", eligibility: "copilot", mandatory: true },
  "copilot-radio-1": { id: "copilot-radio-1", eligibility: "copilot" },
  "copilot-radio-2": { id: "copilot-radio-2", eligibility: "copilot" },
  "concentration-1": { id: "concentration-1", eligibility: "both" },
  "concentration-2": { id: "concentration-2", eligibility: "both" },
  "concentration-3": { id: "concentration-3", eligibility: "both" },
  "landing-gear-1": { id: "landing-gear-1", eligibility: "pilot", allowedValues: [3, 4] },
  "landing-gear-2": { id: "landing-gear-2", eligibility: "pilot", allowedValues: [3, 5] },
  "landing-gear-3": { id: "landing-gear-3", eligibility: "pilot", allowedValues: [2, 4] },
  "flaps-1": { id: "flaps-1", eligibility: "copilot", allowedValues: [1, 2], ordered: true },
  "flaps-2": { id: "flaps-2", eligibility: "copilot", allowedValues: [2, 3], ordered: true },
  "flaps-3": { id: "flaps-3", eligibility: "copilot", allowedValues: [3, 4], ordered: true },
  "flaps-4": { id: "flaps-4", eligibility: "copilot", allowedValues: [5, 6], ordered: true },
  "brakes-2": { id: "brakes-2", eligibility: "pilot", allowedValues: [2], ordered: true },
  "brakes-4": { id: "brakes-4", eligibility: "pilot", allowedValues: [4], ordered: true },
  "brakes-6": { id: "brakes-6", eligibility: "pilot", allowedValues: [6], ordered: true },
};

/** The flaps chain order (top → bottom). */
export const FLAPS_ORDER: readonly SlotId[] = ["flaps-1", "flaps-2", "flaps-3", "flaps-4"];

/** The brakes chain order. */
export const BRAKES_ORDER: readonly SlotId[] = ["brakes-2", "brakes-4", "brakes-6"];

export const LANDING_GEAR_SLOTS: readonly SlotId[] = [
  "landing-gear-1",
  "landing-gear-2",
  "landing-gear-3",
];

export const CONCENTRATION_SLOTS: readonly SlotId[] = [
  "concentration-1",
  "concentration-2",
  "concentration-3",
];

export const RADIO_SLOTS: readonly SlotId[] = ["pilot-radio", "copilot-radio-1", "copilot-radio-2"];

/** Slot ids that must be filled (with the right colour) by end of every round. */
export const MANDATORY_SLOTS: readonly SlotId[] = [
  "pilot-axis",
  "copilot-axis",
  "pilot-engine",
  "copilot-engine",
];

/** Slot ids whose dice are cleared at end of round (everything except switches/markers). */
export const NON_PERSISTENT_SLOTS: readonly SlotId[] = [
  "pilot-axis",
  "pilot-engine",
  "pilot-radio",
  "copilot-axis",
  "copilot-engine",
  "copilot-radio-1",
  "copilot-radio-2",
  "concentration-1",
  "concentration-2",
  "concentration-3",
];

export const COFFEE_TOKEN_CAP = 3;

/**
 * YUL Montréal-Trudeau — base game opening scenario.
 *
 * Approach corridor: airplane starts at index 0, airport at index 8 (9 spaces).
 * Airliner counts per space match the rulebook setup ("place as many Airplane
 * tokens as there are Traffic icons"). The exact distribution should be
 * verified against the printed approach card on first build pass; values below
 * are a faithful approximation that produces a winnable scenario.
 *
 * Reroll tokens: rules say "if there is a Reroll token in the Current Altitude
 * space, as there is in the first round at 6,000 feet, remove it"; we put one
 * at the starting altitude and additional ones at 4000 and 2000 feet.
 *
 * Axis spin marker: rulebook art shows the spin marker around the 4th tilt
 * mark; tests/UI verify on first build pass.
 */
export const SCENARIO_YUL: ScenarioConfig = {
  id: "yul-montreal",
  name: "YUL Montréal-Trudeau",
  totalRounds: 7,
  approach: { airportIndex: 8, airliners: [0, 0, 1, 0, 1, 1, 1, 1, 0] },
  altitudeStart: 6000,
  altitudeStep: 1000,
  rerollAt: [6000, 4000, 2000],
  axisSpinAt: 4,
  speedGaugeStart: { bluePos: 4, orangePos: 8 },
  brakeTrackStart: 0,
  brakeThresholdOffset: 2,
  dicePerPlayer: [4, 4],
  firstPlacer: 0,
};

export const SCENARIOS: Record<string, ScenarioConfig> = {
  "yul-montreal": SCENARIO_YUL,
};

export const ScenarioIdSchema = z.enum(Object.keys(SCENARIOS) as [string, ...string[]]);

export function getScenario(id: string): ScenarioConfig {
  const s = SCENARIOS[id];
  if (!s) throw new Error(`Unknown Sky Team scenario: ${id}`);
  return s;
}

export function getSlotDef(scenario: ScenarioConfig, id: SlotId): SlotDef {
  const base = BASE_SLOT_DEFS[id];
  const override = scenario.slotOverrides?.[id];
  return override ? { ...base, ...override } : base;
}
