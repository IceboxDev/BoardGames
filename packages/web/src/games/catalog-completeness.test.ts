// Completeness guard for the catalog. Every browse-able game must ship the two
// generated artifacts every other game has, so a newly-added game can't merge
// half-finished (as `villainous-introduction-to-evil` once did — catalog entry
// present, but no descriptions and no thumbnail prompt).
//
// Enforced here rather than in a doc because a checklist gets skipped; a failing
// test does not. Both invariants are 100% today.
//
//   1. `<slug>/descriptions.generated.ts` — the three length variants
//      (`pnpm gen-descriptions --slug <slug>`).
//   2. A thumbnail prompt in the root `PROMPTS.md`, so the 16:9 house-style art
//      can be regenerated. The raw BGG box photo `bgg-sync --add` downloads is a
//      placeholder, never the final thumbnail.
//
// NOTE: this cannot detect a thumbnail that is still the placeholder box photo
// (only that a prompt to replace it exists). Thumbnail art stays a human review.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CATALOG } from "@boardgames/core/games/catalog";
import { describe, expect, it } from "vitest";

const GAMES_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(GAMES_DIR, "..", "..", "..", "..");
const PROMPTS = readFileSync(join(REPO_ROOT, "PROMPTS.md"), "utf8");

describe("catalog completeness", () => {
  it.each(CATALOG.map((g) => g.slug))("%s has generated length-variant descriptions", (slug) => {
    const path = join(GAMES_DIR, slug, "descriptions.generated.ts");
    expect(
      existsSync(path),
      `Missing ${slug}/descriptions.generated.ts — run \`pnpm gen-descriptions --slug ${slug}\``,
    ).toBe(true);
  });

  it.each(CATALOG.map((g) => g.slug))("%s has a thumbnail prompt in PROMPTS.md", (slug) => {
    // A `File:` line pointing at this game's thumbnail asset. The trailing
    // `/assets/` keeps `villainous` from matching `villainous-introduction-to-evil`.
    const referenced = PROMPTS.includes(`games/${slug}/assets/`);
    expect(
      referenced,
      `No thumbnail prompt for "${slug}" in PROMPTS.md — add one (mirroring a sibling entry) so the 16:9 art can be generated`,
    ).toBe(true);
  });
});
