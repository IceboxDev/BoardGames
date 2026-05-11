import { describe, expect, it } from "vitest";
import {
  BASE_SLOT_DEFS,
  BRAKES_ORDER,
  CONCENTRATION_SLOTS,
  FLAPS_ORDER,
  getScenario,
  getSlotDef,
  LANDING_GEAR_SLOTS,
  MANDATORY_SLOTS,
  NON_PERSISTENT_SLOTS,
  RADIO_SLOTS,
  SCENARIOS,
  ScenarioIdSchema,
} from "./scenarios";
import { SLOT_IDS } from "./types";

describe("scenarios", () => {
  it("YUL Montreal is registered and matches its id", () => {
    expect(SCENARIOS["yul-montreal"]).toBeDefined();
    expect(SCENARIOS["yul-montreal"].id).toBe("yul-montreal");
  });

  it("getScenario returns the matching scenario", () => {
    const s = getScenario("yul-montreal");
    expect(s.totalRounds).toBe(7);
    expect(s.altitudeStart).toBe(6000);
    expect(s.altitudeStep).toBe(1000);
    expect(s.dicePerPlayer).toEqual([4, 4]);
    expect(s.firstPlacer).toBe(0);
  });

  it("getScenario throws on unknown id", () => {
    expect(() => getScenario("nope")).toThrowError();
  });

  it("approach corridor is consistent: airliners array has airportIndex+1 entries", () => {
    const s = getScenario("yul-montreal");
    expect(s.approach.airliners).toHaveLength(s.approach.airportIndex + 1);
    expect(s.approach.airliners[s.approach.airportIndex]).toBe(0);
  });

  it("ScenarioIdSchema only accepts registered ids", () => {
    expect(ScenarioIdSchema.parse("yul-montreal")).toBe("yul-montreal");
    expect(() => ScenarioIdSchema.parse("nope")).toThrowError();
  });
});

describe("BASE_SLOT_DEFS", () => {
  it("covers every SLOT_ID exactly once", () => {
    expect(Object.keys(BASE_SLOT_DEFS).sort()).toEqual([...SLOT_IDS].sort());
  });

  it("axis and engine slots are mandatory for both players", () => {
    expect(BASE_SLOT_DEFS["pilot-axis"].mandatory).toBe(true);
    expect(BASE_SLOT_DEFS["copilot-axis"].mandatory).toBe(true);
    expect(BASE_SLOT_DEFS["pilot-engine"].mandatory).toBe(true);
    expect(BASE_SLOT_DEFS["copilot-engine"].mandatory).toBe(true);
  });

  it("flaps and brakes are ordered chains", () => {
    for (const id of FLAPS_ORDER) expect(BASE_SLOT_DEFS[id].ordered).toBe(true);
    for (const id of BRAKES_ORDER) expect(BASE_SLOT_DEFS[id].ordered).toBe(true);
  });

  it("landing gear slots are pilot-only", () => {
    for (const id of LANDING_GEAR_SLOTS) expect(BASE_SLOT_DEFS[id].eligibility).toBe("pilot");
  });

  it("flaps slots are copilot-only", () => {
    for (const id of FLAPS_ORDER) expect(BASE_SLOT_DEFS[id].eligibility).toBe("copilot");
  });

  it("brakes slots are pilot-only with exact value constraints", () => {
    expect(BASE_SLOT_DEFS["brakes-2"].allowedValues).toEqual([2]);
    expect(BASE_SLOT_DEFS["brakes-4"].allowedValues).toEqual([4]);
    expect(BASE_SLOT_DEFS["brakes-6"].allowedValues).toEqual([6]);
  });

  it("concentration slots accept any die from either player", () => {
    for (const id of CONCENTRATION_SLOTS) {
      expect(BASE_SLOT_DEFS[id].eligibility).toBe("both");
      expect(BASE_SLOT_DEFS[id].allowedValues).toBeUndefined();
    }
  });

  it("radio slots have no number constraint", () => {
    for (const id of RADIO_SLOTS) expect(BASE_SLOT_DEFS[id].allowedValues).toBeUndefined();
  });
});

describe("MANDATORY_SLOTS and NON_PERSISTENT_SLOTS", () => {
  it("MANDATORY_SLOTS lists exactly the four axis/engine slots", () => {
    expect([...MANDATORY_SLOTS].sort()).toEqual(
      ["copilot-axis", "copilot-engine", "pilot-axis", "pilot-engine"].sort(),
    );
  });

  it("NON_PERSISTENT_SLOTS excludes gear/flaps/brakes", () => {
    for (const id of LANDING_GEAR_SLOTS) expect(NON_PERSISTENT_SLOTS).not.toContain(id);
    for (const id of FLAPS_ORDER) expect(NON_PERSISTENT_SLOTS).not.toContain(id);
    for (const id of BRAKES_ORDER) expect(NON_PERSISTENT_SLOTS).not.toContain(id);
  });
});

describe("getSlotDef", () => {
  it("returns the base def when no override", () => {
    const s = getScenario("yul-montreal");
    expect(getSlotDef(s, "pilot-axis")).toEqual(BASE_SLOT_DEFS["pilot-axis"]);
  });

  it("merges scenario overrides on top", () => {
    const s = {
      ...getScenario("yul-montreal"),
      slotOverrides: { "pilot-radio": { mandatory: true } },
    };
    const def = getSlotDef(s, "pilot-radio");
    expect(def.mandatory).toBe(true);
    expect(def.eligibility).toBe("pilot");
  });
});
