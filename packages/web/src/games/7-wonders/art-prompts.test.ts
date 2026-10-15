// Completeness guard for ART-PROMPTS.md: every Wonder, Edifice project,
// resource, science symbol and score category the board draws has a prompt.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EDIFICES } from "@boardgames/core/games/7-wonders/edifice";
import {
  RESOURCE_TYPES,
  SCIENCE_SYMBOLS,
  WONDER_IDS,
} from "@boardgames/core/games/7-wonders/types";
import { describe, expect, it } from "vitest";
import manifest from "./assets/art/manifest.json" with { type: "json" };
import { SCORE_CATEGORIES } from "./card-utils";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOC = readFileSync(join(HERE, "ART-PROMPTS.md"), "utf8");
const FILES = new Set([...DOC.matchAll(/\*\*`([a-z0-9-]+\.png)`\*\*/g)].map((m) => m[1]));

/** Files in a batch marked "pending": prompted, not generated yet. */
const PENDING = new Set(
  DOC.split(/\n## Batch \d+/)
    .filter((b) => /^[^\n]*— pending/.test(b))
    .flatMap((b) => [...b.matchAll(/\*\*`([a-z0-9-]+\.png)`\*\*/g)].map((m) => m[1])),
);

const slug = (name: string) => name.toLowerCase().replace(/\s+/g, "-");
/** The score pad calls the coins category Treasury. */
const SCORE_FILE: Record<string, string> = { coins: "treasury" };

describe("7 Wonders art prompts", () => {
  it.each(WONDER_IDS)("%s has a day board, a night board and a crest", (id) => {
    for (const f of [`wonder-${id}-day.png`, `wonder-${id}-night.png`, `crest-${id}.png`]) {
      expect(FILES).toContain(f);
    }
  });

  it("has every Edifice project, as a blueprint and built", () => {
    for (const e of EDIFICES) {
      expect(FILES).toContain(`edifice-${slug(e.name)}-blueprint.png`);
      expect(FILES).toContain(`edifice-${slug(e.name)}.png`);
    }
  });

  it("has every resource, science symbol, score category and Age back", () => {
    for (const r of [...RESOURCE_TYPES, ...SCIENCE_SYMBOLS])
      expect(FILES).toContain(`icon-${r}.png`);
    for (const c of SCORE_CATEGORIES) {
      expect(FILES).toContain(`score-${SCORE_FILE[c.key] ?? c.key}.png`);
    }
    for (const age of [1, 2, 3]) expect(FILES).toContain(`back-age-${age}.png`);
  });

  it("ships every prompted image, converted, and nothing unprompted", () => {
    const names = Object.keys(manifest).map((n) => `${n}.png`);
    expect(new Set(names)).toEqual(new Set([...FILES].filter((f) => !PENDING.has(f))));
    for (const n of Object.keys(manifest)) {
      expect(existsSync(join(HERE, "assets/art", `${n}.webp`)), n).toBe(true);
    }
  });

  it("keeps batches to at most 10 prompts, each naming its aspect ratio", () => {
    const batches = DOC.split(/\n## Batch \d+/).slice(1);
    expect(batches.length).toBeGreaterThan(0);
    for (const b of batches) {
      const prompts = [...b.matchAll(/\*\*`[a-z0-9-]+\.png`\*\*[^\n]*\n\n```text\n([^`]+)```/g)];
      expect(prompts.length).toBeLessThanOrEqual(10);
      for (const [, text] of prompts) expect(text).toMatch(/\d+:\d+ aspect ratio/);
    }
  });
});
