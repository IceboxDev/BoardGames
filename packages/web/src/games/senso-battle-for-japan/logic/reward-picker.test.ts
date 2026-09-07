import { describe, expect, it } from "vitest";
import { initialPicker, pickerAs, reducePicker } from "./reward-picker";

describe("reward picker", () => {
  it("starts at the kind step for a clan seat, the clan step for the Emperor, and a pre-armed bonus", () => {
    expect(initialPicker("rewards", false)).toEqual({ step: "kind" });
    expect(initialPicker("rewards", true)).toEqual({ step: "clan" });
    expect(initialPicker("bonus", false)).toEqual({ step: "target", kind: "bonus" });
    expect(initialPicker("other", false)).toEqual({ step: "idle" });
  });

  it("walks Balance through source → destination and back", () => {
    let s = initialPicker("rewards", false);
    s = reducePicker(s, { type: "pick-kind", kind: "balance" });
    expect(s).toEqual({ step: "balance-source" });
    s = reducePicker(s, { type: "pick-source", region: 6, square: 1 });
    expect(s).toEqual({ step: "balance-dest", from: { region: 6, square: 1 } });
    expect(reducePicker(s, { type: "back" })).toEqual({ step: "balance-source" });
    expect(reducePicker(s, { type: "cancel" })).toEqual({ step: "kind" });
  });

  it("keeps the Emperor's chosen clan on every step and cancels back to the clan step", () => {
    let s = initialPicker("rewards", true);
    s = reducePicker(s, { type: "pick-clan", clan: "oda" });
    expect(s).toEqual({ step: "kind", as: "oda" });
    s = reducePicker(s, { type: "pick-kind", kind: "determination" });
    expect(s).toEqual({ step: "target", kind: "determination", as: "oda" });
    expect(pickerAs(s)).toBe("oda");
    expect(reducePicker(s, { type: "cancel" })).toEqual({ step: "clan" });
    expect(reducePicker(s, { type: "back" })).toEqual({ step: "kind", as: "oda" });
  });

  it("ignores kind picks before a clan is chosen and never cancels out of the bonus", () => {
    const clan = initialPicker("rewards", true);
    expect(reducePicker(clan, { type: "pick-kind", kind: "aggression" })).toEqual(clan);
    const bonus = initialPicker("bonus", false);
    expect(reducePicker(bonus, { type: "cancel" })).toEqual(bonus);
    expect(reducePicker(bonus, { type: "back" })).toEqual(bonus);
  });
});
