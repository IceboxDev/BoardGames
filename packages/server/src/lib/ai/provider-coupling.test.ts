import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Features name roles, never providers (docs/ai-architecture.md). Only the
// AI platform's own provider files may name a provider package, a gateway
// option or a vendor model slug; anything else re-couples a feature to one
// provider and silently breaks the profile switch.

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const SCANNED = ["packages/server/src", "scripts"];

/** Files allowed to speak a provider's language. */
const ALLOWED = new Set([
  "packages/server/src/lib/ai/models.ts",
  "packages/server/src/lib/ai/providers.ts",
  "packages/server/src/lib/ai/pricing.ts",
  "packages/server/src/lib/ai/mcp.ts",
  "packages/server/src/lib/ai/transports/openai-background.ts",
  // The opt-in legacy avatar path (AI_MODEL_AVATAR=openai-image-tool).
  "packages/server/src/lib/avatar-image.ts",
]);

const RULES: { name: string; re: RegExp }[] = [
  {
    name: "provider package import",
    re: /from "(@ai-sdk\/(openai|anthropic|gateway|google)|openai)"/,
  },
  { name: "gateway request option", re: /providerOptions:\s*\{\s*gateway/ },
  { name: "vendor model slug", re: /["'`](openai|anthropic|google)[/:][a-z]/ },
];

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* sourceFiles(path);
    else if (/\.(ts|mjs)$/.test(name) && !/\.test\.ts$/.test(name)) yield path;
  }
}

describe("provider coupling", () => {
  it("only the AI platform names providers", () => {
    const hits: string[] = [];
    for (const dir of SCANNED) {
      for (const file of sourceFiles(join(ROOT, dir))) {
        const rel = relative(ROOT, file);
        if (ALLOWED.has(rel)) continue;
        readFileSync(file, "utf8")
          .split("\n")
          .forEach((line, i) => {
            if (/^\s*(\/\/|\*)/.test(line)) return; // comments may describe history
            for (const rule of RULES) {
              if (rule.re.test(line)) hits.push(`${rel}:${i + 1} [${rule.name}] ${line.trim()}`);
            }
          });
      }
    }
    expect(hits).toEqual([]);
  });
});
