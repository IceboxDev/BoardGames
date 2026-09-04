import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  listExtensions,
  listFonts,
  listPatterns,
  listPresets,
  loadAmbientEffects,
} from "./registry";

// The registry validates each discovered module's shape and SKIPS anything
// that doesn't match, so a typo'd field (`stacks:` for `stack:`, a bad tier)
// makes a preset/pattern/font/effect vanish from the UI with no error — the
// module's own unit test still passes, because it only tests itself.
//
// These tests close that hole from the other side: every non-test module file
// on disk must survive validation and reach the registry. They compare counts
// against the directory rather than a hardcoded number, so adding a module
// needs no edit here — only a BROKEN module fails.

// vitest runs with cwd = packages/web (same assumption as
// pages/theme-preview-fixtures.test.ts, which reads index.css this way).
const themeDir = join(process.cwd(), "src/lib/theme");
const effectsDir = join(process.cwd(), "src/components/ambient/effects");

function moduleFileCount(dir: string, extensions: readonly string[]): number {
  return readdirSync(dir).filter(
    (f) => extensions.some((e) => f.endsWith(e)) && !f.includes(".test."),
  ).length;
}

describe("theme registry discovery", () => {
  it("loads every preset module on disk", () => {
    expect(listPresets().length).toBe(moduleFileCount(join(themeDir, "presets"), [".ts"]));
  });

  it("loads every pattern module on disk", () => {
    expect(listPatterns().length).toBe(moduleFileCount(join(themeDir, "patterns"), [".ts"]));
  });

  it("loads every font module on disk", () => {
    expect(listFonts().length).toBe(moduleFileCount(join(themeDir, "fonts"), [".ts"]));
  });

  it("loads every extension module on disk", () => {
    expect(listExtensions().length).toBe(
      moduleFileCount(join(themeDir, "extensions"), [".ts", ".tsx"]),
    );
  });

  it("loads every ambient effect module on disk", async () => {
    expect((await loadAmbientEffects()).length).toBe(moduleFileCount(effectsDir, [".tsx"]));
  });

  it("keeps every registry key unique across modules", () => {
    for (const [label, keys] of [
      ["presets", listPresets().map((p) => p.key)],
      ["patterns", listPatterns().map((p) => p.key)],
      ["fonts", listFonts().map((f) => f.key)],
    ] as const) {
      expect(new Set(keys).size, `${label} have duplicate keys`).toBe(keys.length);
    }
  });
});
