// Completeness guard for ART-PROMPTS.md: every card of every expedition, each
// trail, medallion and insignia the board draws has a prompt; every image in
// the manifest has a prompt and, unless its batch is still pending, a webp.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXPEDITION_COLORS } from "@boardgames/core/games/lost-cities/types";
import { describe, expect, it } from "vitest";
import manifest from "./assets/art/manifest.json" with { type: "json" };

const HERE = dirname(fileURLToPath(import.meta.url));
const DOC = readFileSync(join(HERE, "ART-PROMPTS.md"), "utf8");
const FILES = new Set([...DOC.matchAll(/\*\*`([a-z0-9-]+\.png)`\*\*/g)].map((m) => m[1]));

/** Files in a batch marked "pending": prompted, not generated yet. */
const PENDING = new Set(
  DOC.split(/\n## Batch \d+/)
    .filter((b) => /^[^\n]*— pending/.test(b))
    .flatMap((b) => [...b.matchAll(/\*\*`([a-z0-9-]+\.png)`\*\*/g)].map((m) => m[1])),
);

const SLOTS = ["w1", "w2", "w3", "2", "3", "4", "5", "6", "7", "8", "9", "10"];

describe("Lost Cities art prompts", () => {
  it.each(EXPEDITION_COLORS)("%s has all twelve cards, a trail and a medallion", (color) => {
    for (const slot of SLOTS) expect(FILES).toContain(`card-${color}-${slot}.png`);
    expect(FILES).toContain(`trail-${color}.png`);
    expect(FILES).toContain(`medal-${color}.png`);
  });

  it("prompts every image in the manifest", () => {
    for (const name of Object.keys(manifest)) expect(FILES).toContain(`${name}.png`);
  });

  it("has a webp for every image whose batch is no longer pending", () => {
    for (const name of Object.keys(manifest)) {
      if (PENDING.has(`${name}.png`)) continue;
      expect(existsSync(join(HERE, "assets", "art", `${name}.webp`)), name).toBe(true);
    }
  });

  it("puts the cast sheet in every card batch's setup block", () => {
    const setups = [...DOC.matchAll(/\*\*Setup block\*\*[^`]*```text\n([^`]+)```/g)].map(
      (m) => m[1],
    );
    const cardSetups = setups.filter((s) => s.includes("expedition, its"));
    expect(cardSetups).toHaveLength(EXPEDITION_COLORS.length * 2);
    for (const s of cardSetups) expect(s).toContain("DR. AMARA OSEI, a woman of 52");
  });
});
