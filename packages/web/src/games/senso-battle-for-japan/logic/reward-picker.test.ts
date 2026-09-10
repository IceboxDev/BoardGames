import { describe, expect, it } from "vitest";
import { initialPicker, isEmperorPicker, pickerAs, reducePicker } from "./reward-picker";

describe("reward picker", () => {
  it("starts at the kind step for every seat (flagged for the Emperor) and a pre-armed bonus", () => {
    expect(initialPicker("rewards", false)).toEqual({ step: "kind" });
    expect(initialPicker("rewards", true)).toEqual({ step: "kind", emperor: true });
    expect(initialPicker("bonus", false)).toEqual({ step: "target", kind: "bonus" });
    expect(initialPicker("other", false)).toEqual({ step: "idle" });
  });

  it("walks Balance through source → destination and back", () => {
    let s = initialPicker("rewards", false);
    s = reducePicker(s, { type: "pick-kind", kind: "balance" });
    expect(s).toEqual({ step: "balance-source" });
    s = reducePicker(s, { type: "pick-source", region: 6, square: 1 });
    expect(s).toEqual({ step: "balance-dest", from: { region: 6, square: 1 } });
    // Hopping to another cube re-targets without leaving the reward.
    s = reducePicker(s, { type: "pick-source", region: 2, square: 0 });
    expect(s).toEqual({ step: "balance-dest", from: { region: 2, square: 0 } });
    expect(reducePicker(s, { type: "back" })).toEqual({ step: "balance-source" });
    expect(reducePicker(s, { type: "cancel" })).toEqual({ step: "kind" });
  });

  it("asks the Emperor for a clan after Balance or Determination and keeps it on every later step", () => {
    let s = initialPicker("rewards", true);
    s = reducePicker(s, { type: "pick-kind", kind: "determination" });
    expect(s).toEqual({ step: "clan", kind: "determination" });
    expect(pickerAs(s)).toBeUndefined();
    s = reducePicker(s, { type: "pick-clan", clan: "oda" });
    expect(s).toEqual({ step: "target", kind: "determination", as: "oda" });
    expect(pickerAs(s)).toBe("oda");
    expect(isEmperorPicker(s)).toBe(true);
    expect(reducePicker(s, { type: "back" })).toEqual({ step: "clan", kind: "determination" });
    expect(reducePicker(s, { type: "cancel" })).toEqual({ step: "kind", emperor: true });

    s = reducePicker(initialPicker("rewards", true), { type: "pick-kind", kind: "balance" });
    s = reducePicker(s, { type: "pick-clan", clan: "mori" });
    expect(s).toEqual({ step: "balance-source", as: "mori" });
    s = reducePicker(s, { type: "pick-source", region: 1, square: 0 });
    expect(s).toEqual({ step: "balance-dest", as: "mori", from: { region: 1, square: 0 } });
    expect(reducePicker(reducePicker(s, { type: "back" }), { type: "back" })).toEqual({
      step: "clan",
      kind: "balance",
    });
  });

  it("sends the Emperor's Aggression straight to the map — it strikes as nobody", () => {
    let s = initialPicker("rewards", true);
    s = reducePicker(s, { type: "pick-kind", kind: "aggression" });
    expect(s).toEqual({ step: "target", kind: "aggression", emperor: true });
    expect(pickerAs(s)).toBeUndefined();
    expect(isEmperorPicker(s)).toBe(true);
    expect(reducePicker(s, { type: "back" })).toEqual({ step: "kind", emperor: true });
    // Re-picking a kind mid-flow keeps the Emperor's flow.
    expect(reducePicker(s, { type: "pick-kind", kind: "balance" })).toEqual({
      step: "clan",
      kind: "balance",
    });
    // A clan seat's strike carries no flag and cancels to a plain kind step.
    const clan = reducePicker(initialPicker("rewards", false), {
      type: "pick-kind",
      kind: "aggression",
    });
    expect(clan).toEqual({ step: "target", kind: "aggression" });
    expect(isEmperorPicker(clan)).toBe(false);
    expect(reducePicker(clan, { type: "cancel" })).toEqual({ step: "kind" });
  });

  it("ignores clan picks outside the clan step and never cancels out of the bonus", () => {
    const kind = initialPicker("rewards", true);
    expect(reducePicker(kind, { type: "pick-clan", clan: "oda" })).toEqual(kind);
    const bonus = initialPicker("bonus", false);
    expect(reducePicker(bonus, { type: "cancel" })).toEqual(bonus);
    expect(reducePicker(bonus, { type: "back" })).toEqual(bonus);
    expect(reducePicker(bonus, { type: "pick-kind", kind: "balance" })).toEqual(bonus);
  });
});
