import { describe, expect, it } from "vitest";
import { initialsFromName } from "./names";

describe("initialsFromName", () => {
  it("takes first + last initial for multi-word names", () => {
    expect(initialsFromName("Mara the Wise")).toBe("MW");
    expect(initialsFromName("Ada Lovelace")).toBe("AL");
  });

  it("takes the first two letters of a single word", () => {
    expect(initialsFromName("Finn")).toBe("FI");
  });

  it("uppercases a single-letter name", () => {
    expect(initialsFromName("a")).toBe("A");
  });

  it("collapses extra whitespace", () => {
    expect(initialsFromName("  Mara   the   Wise  ")).toBe("MW");
  });

  it("returns ? for an empty/blank name", () => {
    expect(initialsFromName("")).toBe("?");
    expect(initialsFromName("   ")).toBe("?");
  });
});
