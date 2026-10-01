import { describe, expect, it } from "vitest";
import { artsWedgeForScenario } from "./palette";

describe("artsWedgeForScenario", () => {
  it("reads brown off the Genus boxes and purple off the current ones", () => {
    expect(artsWedgeForScenario("Genus · German")).toBe("brown");
    expect(artsWedgeForScenario("Classic · English")).toBe("purple");
    expect(artsWedgeForScenario("Master")).toBe("purple");
  });

  it("falls back to purple when no edition is recorded", () => {
    expect(artsWedgeForScenario(undefined)).toBe("purple");
    expect(artsWedgeForScenario("German")).toBe("purple");
  });
});
