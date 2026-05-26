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
  "landing-gear-1": { id: "landing-gear-1", eligibility: "pilot", allowedValues: [1, 2] },
  "landing-gear-2": { id: "landing-gear-2", eligibility: "pilot", allowedValues: [3, 4] },
  "landing-gear-3": { id: "landing-gear-3", eligibility: "pilot", allowedValues: [5, 6] },
  "flaps-1": { id: "flaps-1", eligibility: "copilot", allowedValues: [1, 2], ordered: true },
  "flaps-2": { id: "flaps-2", eligibility: "copilot", allowedValues: [2, 3], ordered: true },
  "flaps-3": { id: "flaps-3", eligibility: "copilot", allowedValues: [4, 5], ordered: true },
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
 * YUL Montréal-Trudeau — base game opening scenario (YUL Green setup).
 *
 * Approach corridor: 7 spaces total. The plane starts on space 0; the
 * airport sits on space 6. Initial airliner traffic: 1@2, 2@3, 1@4, 3@5,
 * 2@6 (the airport itself can carry airliners — they must be cleared
 * before the plane lands, otherwise loss-airliners-remain triggers).
 */
export const SCENARIO_YUL: ScenarioConfig = {
  id: "yul-montreal",
  name: "YUL Montréal-Trudeau",
  // 6 numbered approach rounds (one per 1,000 ft of altitude from 6,000 →
  // 1,000). After the last drop the plane touches down at 0 ft and the
  // landing-condition check runs — that's the "Final Approach" step the UI
  // surfaces with its own label rather than padding the round counter to 7.
  totalRounds: 6,
  approach: { airportIndex: 6, airliners: [0, 0, 1, 2, 1, 3, 2] },
  altitudeStart: 6000,
  altitudeStep: 1000,
  rerollAt: [6000, 4000, 2000],
  // Axis spin: the red X warnings on the bezel sit at ±3 ticks; landing on
  // (or past) them spins the plane out → loss. Triangle markers cover the
  // safe range ±2.
  axisSpinAt: 3,
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
