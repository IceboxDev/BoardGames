// Completeness guard for ART-PROMPTS.md: every image in the manifest has a
// prompt, every prompt is in the manifest, and every image whose batch is no
// longer pending has its webp.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

describe("Decrypto art prompts", () => {
  it("prompts every image in the manifest", () => {
    for (const name of Object.keys(manifest)) expect(FILES).toContain(`${name}.png`);
  });

  it("lists every prompted image in the manifest", () => {
    for (const file of FILES) expect(Object.keys(manifest)).toContain(file.replace(/\.png$/, ""));
  });

  it("has a webp for every image whose batch is no longer pending", () => {
    for (const name of Object.keys(manifest)) {
      if (PENDING.has(`${name}.png`)) continue;
      expect(existsSync(join(HERE, "assets", "art", `${name}.webp`)), name).toBe(true);
    }
  });
});
