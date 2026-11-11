import { describe, expect, it } from "vitest";
import { firstNameOf, goodbyeLine } from "./goodbye-copy";

describe("goodbye line", () => {
  it("thanks a member by first name", () => {
    expect(goodbyeLine(firstNameOf("Mantas Kandratavičius"))).toBe(
      "Thanks for every game, Mantas — every grudge and every rule we made up.",
    );
  });

  it("falls back to the plain line without a name", () => {
    expect(goodbyeLine(firstNameOf(null))).toBe(
      "Thanks for every game, every grudge and every rule we made up.",
    );
    expect(firstNameOf("   ")).toBeNull();
  });
});
