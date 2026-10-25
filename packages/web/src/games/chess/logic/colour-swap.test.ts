import { describe, expect, it } from "vitest";
import { colourSwap } from "./colour-swap";

const setup = { strategy: "sf-1400", color: "random" as const, timeControl: null, takebacks: true };
const human = { kind: "human" as const };
const ai = { kind: "ai" as const, strategy: "sf-1400" };

describe("colourSwap", () => {
  it("offers the other colour than the one just played", () => {
    expect(colourSwap(setup, { seats: [human, ai] })).toEqual([
      { label: "Play as Black", setup: { ...setup, color: "b" } },
    ]);
    expect(colourSwap(setup, { seats: [ai, human] })[0]?.setup.color).toBe("w");
  });
});
