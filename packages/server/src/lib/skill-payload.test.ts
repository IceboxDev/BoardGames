import { PlayerSkillResponseSchema } from "@boardgames/core/protocol";
import { SKILL_CONFIG_V1 } from "@boardgames/core/skill/config";
import { describe, expect, it } from "vitest";
import { unratedPayload } from "./skill-payload.ts";

// Regression: `GET /api/skills/players/:id` 500'd for any member the fit had
// never seen — nobody with zero rated matches appears in `state.players` — so
// their stats page showed "Couldn't load the stats". The fallback payload was
// an untyped object literal that silently fell behind the wire schema when a
// required field (`ratedSlugs`) was added. It is typed now, so the compiler
// catches a missing field; this pins that it satisfies the schema at runtime.

describe("unratedPayload", () => {
  it("satisfies the player-skill wire schema", () => {
    expect(() => PlayerSkillResponseSchema.parse(unratedPayload("u1"))).not.toThrow();
  });

  it("reports an un-unlocked profile with the live thresholds", () => {
    const parsed = PlayerSkillResponseSchema.parse(unratedPayload("u1"));
    expect(parsed.userId).toBe("u1");
    expect(parsed.eligibility).toMatchObject({
      eligible: false,
      ratedMatches: 0,
      distinctGames: 0,
      minMatches: SKILL_CONFIG_V1.minMatches,
      minGames: SKILL_CONFIG_V1.minGames,
    });
    expect(parsed.traits).toBeNull();
    expect(parsed.games).toEqual([]);
    expect(parsed.ratedSlugs).toEqual([]);
    expect(parsed.highlights).toEqual([]);
  });
});
