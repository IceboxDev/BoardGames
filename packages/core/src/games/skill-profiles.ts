// Per-game skill weight lookup — the rating engine's bridge from a match's
// game slug to the six-trait evidence distribution. Weights are editorial
// constants in `catalog.json` (see `SkillWeightsSchema` for the invariants);
// this module deliberately exposes only the lookup, mirroring `bgg/snapshot.ts`.

import type { SkillWeights } from "../protocol/http/skills.ts";
import { CATALOG } from "./catalog.ts";

const BY_SLUG: ReadonlyMap<string, SkillWeights> = new Map(
  CATALOG.map((entry) => [entry.slug, entry.skills]),
);

/** Skill weights for a catalog game, or undefined for off-catalog slugs. */
export function skillProfileBySlug(slug: string): SkillWeights | undefined {
  return BY_SLUG.get(slug);
}
