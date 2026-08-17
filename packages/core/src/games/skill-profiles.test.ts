import { describe, expect, it } from "vitest";
import { SkillWeightsSchema } from "../protocol/http/skills.ts";
import { CATALOG } from "./catalog.ts";
import { skillProfileBySlug } from "./skill-profiles.ts";

describe("skillProfileBySlug", () => {
  it("returns the committed weights for a catalog slug", () => {
    expect(skillProfileBySlug("chess")).toEqual({
      int: 50,
      pln: 40,
      per: 10,
      soph: 0,
      soc: 0,
      dex: 0,
    });
  });

  it("returns undefined for an off-catalog slug", () => {
    expect(skillProfileBySlug("deck-french-suited")).toBeUndefined();
    expect(skillProfileBySlug("not-a-game")).toBeUndefined();
  });
});

describe("catalog skill weights", () => {
  it.each(CATALOG.map((g) => g.slug))("%s has valid weights summing to 100", (slug) => {
    const weights = skillProfileBySlug(slug);
    expect(weights).toBeDefined();
    expect(SkillWeightsSchema.safeParse(weights).success).toBe(true);
  });
});
