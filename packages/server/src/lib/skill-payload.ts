// Pure payload shapes for the skill routes. Deliberately free of auth/db
// imports so it can be unit-tested without a database connection.

import type { PlayerSkillResponse } from "@boardgames/core/protocol";
import { SKILL_CONFIG_V1 } from "@boardgames/core/skill/config";

/**
 * The payload for a member the fit has never seen — someone with no rated
 * match yet, so they exist in `user` but not in the stored `state.players`.
 *
 * Typed as `PlayerSkillResponse` ON PURPOSE: the annotation turns a new
 * required field on the schema into a COMPILE error here instead of a 500 on
 * exactly the members with an empty history (which is how `ratedSlugs` shipped
 * broken — the old inline literal was untyped, so it silently fell behind).
 */
export function unratedPayload(userId: string): PlayerSkillResponse {
  return {
    userId,
    eligibility: {
      eligible: false,
      ratedMatches: 0,
      distinctGames: 0,
      minMatches: SKILL_CONFIG_V1.minMatches,
      minGames: SKILL_CONFIG_V1.minGames,
    },
    traits: null,
    games: [],
    ratedSlugs: [],
    highlights: [],
  };
}
