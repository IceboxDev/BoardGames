import { describe, expect, it } from "vitest";
import { hasDuplicateAccounts, NOBODY } from "./port-helpers";

describe("hasDuplicateAccounts", () => {
  it("is false on a pristine form where every seat is unmapped", () => {
    expect(hasDuplicateAccounts([NOBODY, NOBODY, NOBODY, NOBODY])).toBe(false);
  });

  it("is false when all mapped seats point at distinct accounts", () => {
    expect(hasDuplicateAccounts(["u1", "u2", NOBODY, "u3"])).toBe(false);
  });

  it("is true when two seats share an account", () => {
    expect(hasDuplicateAccounts(["u1", NOBODY, "u1"])).toBe(true);
  });
});
