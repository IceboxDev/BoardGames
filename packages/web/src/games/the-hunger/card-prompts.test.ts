// Completeness guard for CARD-PROMPTS.md: every card, Vampire seat and icon the
// compositor will ask for has a prompt, so a newly transcribed card cannot land
// without its art being specified.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PATHS,
  REGIONS,
  SPACE_EFFECTS,
} from "@boardgames/core/games/the-hunger/content/board-schema";
import { CARD_DEFS, VAMPIRES } from "@boardgames/core/games/the-hunger/content/cards";
import { HUMAN_CATEGORIES, type Keyword } from "@boardgames/core/games/the-hunger/types";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOC = readFileSync(join(HERE, "CARD-PROMPTS.md"), "utf8");
const FILES = new Set([...DOC.matchAll(/`([a-z0-9-]+\.png)`/g)].map((m) => m[1]));

/** Familiars: one picture per effect, whatever the card's name. */
const FAMILIAR_ART: Record<string, readonly string[]> = {
  goat: ["nanny", "capra"],
  wolf: ["echo", "bo", "gray", "jahda"],
  pigeon: ["tyson", "porumbel"],
  dog: ["kutya", "caine"],
  pig: ["chop", "malac"],
  owl: ["sova", "bagoly"],
  rat: ["wee-vlad", "patcani"],
  snake: ["wiggles", "kaa"],
  bear: ["ursa", "teddy"],
  panther: ["lockjaw", "nanoosh"],
};

/** Cards that share a picture, by card id. */
const SHARED_ART: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(FAMILIAR_ART).flatMap(([beast, ids]) =>
      ids.map((id) => [id, `familiar-${beast}`]),
    ),
  ),
  "vampiric-will-double": "power-vampiric-will",
  "vampiric-strength-great": "power-vampiric-strength",
  "vampiric-speed-2": "power-vampiric-speed",
  "vampiric-speed-3": "power-vampiric-speed",
  "eternal-rose": "rose-eternal",
  "dead-rose": "rose-dead",
  "perfect-rose": "rose-perfect",
  "s-the-hunger": "starting-the-hunger",
  "vampire-speed-2": "starting-vampire-speed",
  "vampire-speed-3": "starting-vampire-speed",
  "vampire-speed-4": "starting-vampire-speed",
  "vampire-thirst": "starting-vampire-thirst",
  "s-vampire-strength": "starting-vampire-strength",
};

function artFile(id: string, type: string): string {
  return `${SHARED_ART[id] ?? `${type}-${id}`}.png`;
}

const KEYWORDS: readonly Keyword[] = [
  "fast",
  "slow",
  "spicy",
  "confuse",
  "holy-water",
  "gregarious",
  "ready",
  "permanent",
  "unique",
  "inspiring",
];

describe("The Hunger card prompts", () => {
  it.each([...CARD_DEFS.values()].map((d) => [d.id, d.type] as const))("%s has art", (id, type) => {
    expect(FILES).toContain(artFile(id, type));
  });

  it("gives every card in a Familiar group the same effect", () => {
    for (const ids of Object.values(FAMILIAR_ART)) {
      const texts = new Set(ids.map((id) => CARD_DEFS.get(id)?.text));
      expect(texts.size).toBe(1);
    }
  });

  it("keeps every batch to at most 10 prompts", () => {
    for (const batch of DOC.split(/^## Batch \d+/m).slice(1)) {
      const prompts = batch.match(/^\*\*`[a-z0-9-]+\.png`\*\*/gm) ?? [];
      expect(prompts.length).toBeLessThanOrEqual(10);
    }
  });

  it("names one Vampire trio per seat", () => {
    const seats = [...FILES].flatMap((f) => /^vampire-([a-z]+)-bust\.png$/.exec(f)?.[1] ?? []);
    expect(seats.sort()).toEqual(VAMPIRES.map((v) => v.id).sort());
    for (const seat of seats) {
      expect(FILES).toContain(`vampire-${seat}-full.png`);
      expect(FILES).toContain(`vampire-${seat}-sigil.png`);
    }
  });

  it("has an icon for every keyword, type, region, path and space", () => {
    const icons = [
      ...KEYWORDS,
      ...HUMAN_CATEGORIES,
      ...REGIONS,
      ...PATHS,
      ...SPACE_EFFECTS.filter((e) => e !== "none").map((e) =>
        e === "castle" || e === "cemetery" ? `space-${e}` : e,
      ),
    ];
    for (const icon of icons) expect(FILES).toContain(`icon-${icon}.png`);
  });
});
