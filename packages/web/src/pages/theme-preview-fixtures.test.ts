import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  applyThemeFixtureToRoot,
  clearThemeFixtureFromRoot,
  THEME_FIXTURES,
  THEME_VAR_NAMES,
  themeFixtureByKey,
} from "./theme-preview-fixtures";

// Value-shape pins for the generator's actual output — deliberately strict
// (no leading-zero junk, no bare dots) so a malformed fixture value fails
// here instead of silently parsing as an invalid CSS declaration.
const HEX = /^#[0-9a-f]{6}$/;
const SCALE = /^(?:0|0\.\d+|[1-9]\d*(?:\.\d+)?)$/;
const AVATAR_RADIUS = /^(?:0px|9999px|(?:0\.\d+|[1-9]\d*(?:\.\d+)?)rem)$/;
const GLOW = /^0 0 12px -4px color-mix\(in srgb, #[0-9a-f]{6} 50%, transparent\)$/;

describe("theme fixtures", () => {
  it("ships nine fixtures with unique keys", () => {
    expect(THEME_FIXTURES).toHaveLength(9);
    expect(new Set(THEME_FIXTURES.map((f) => f.key)).size).toBe(9);
  });

  it("defines well-formed values for every var on every fixture", () => {
    for (const fixture of THEME_FIXTURES) {
      for (const name of THEME_VAR_NAMES) {
        const value = fixture.vars[name];
        const label = `${fixture.key} ${name}`;
        if (name.startsWith("--color-")) {
          expect(value, label).toMatch(HEX);
        } else if (name === "--shadow-glow-accent") {
          expect(value, label).toMatch(GLOW);
        } else if (name === "--avatar-radius") {
          expect(value, label).toMatch(AVATAR_RADIUS);
        } else {
          // The two unitless radius scale multipliers.
          expect(value, label).toMatch(SCALE);
        }
      }
    }
  });

  // Guard against the fixture var NAMES drifting from the real design tokens:
  // every index.css-owned custom property this page overrides must exist
  // there. `--radius-card-scale` / `--radius-ui-scale` / `--avatar-radius`
  // are consumed by the primitives unit's `components/ui/radii.ts` (merged as
  // PR #5, not yet on this branch), so they are exempt here — extending this
  // cross-check against radii.ts once the branches merge is a listed
  // follow-up in the PR body.
  it("uses var names that exist in index.css", () => {
    // Vitest runs with cwd = packages/web (vite transforms import.meta.url
    // into a non-file URL, so resolve from the package root instead).
    const css = readFileSync(join(process.cwd(), "src", "index.css"), "utf8");
    for (const name of THEME_VAR_NAMES) {
      if (!name.startsWith("--color-") && name !== "--shadow-glow-accent") continue;
      expect(css, `expected ${name} to be declared in index.css`).toContain(`${name}:`);
    }
  });

  it("keeps the classic fixture pinned to the shipped default palette", () => {
    const classic = themeFixtureByKey("classic");
    expect(classic?.vars["--color-surface-950"]).toBe("#08090d");
    expect(classic?.vars["--color-fg-primary"]).toBe("#e2e6ee");
    expect(classic?.vars["--color-accent-500"]).toBe("#6366f1");
    expect(classic?.vars["--color-neon-cyan"]).toBe("#22d3ee");
    expect(classic?.vars["--radius-card-scale"]).toBe("1");
    expect(classic?.vars["--radius-ui-scale"]).toBe("1");
    expect(classic?.vars["--shadow-glow-accent"]).toBe(
      "0 0 12px -4px color-mix(in srgb, #6366f1 50%, transparent)",
    );
  });

  it("clear without a prior apply leaves foreign inline vars alone", () => {
    const root = document.documentElement;
    root.style.setProperty("--color-fg-primary", "#abcdef");
    clearThemeFixtureFromRoot();
    expect(root.style.getPropertyValue("--color-fg-primary")).toBe("#abcdef");
    root.style.removeProperty("--color-fg-primary");
  });

  it("apply/clear round-trips overrides on document.documentElement", () => {
    const terminal = themeFixtureByKey("terminal");
    if (!terminal) throw new Error("terminal fixture missing");
    const root = document.documentElement;

    applyThemeFixtureToRoot(terminal);
    expect(root.style.getPropertyValue("--color-accent-500")).toBe("#00ff88");
    expect(root.style.getPropertyValue("--radius-ui-scale")).toBe("0");
    expect(root.dataset.selectStyle).toBe("underline");

    clearThemeFixtureFromRoot();
    expect(root.style.getPropertyValue("--color-accent-500")).toBe("");
    expect(root.dataset.selectStyle).toBeUndefined();
  });

  // Post-merge, the theme engine applies the user's real theme via the same
  // documentElement inline vars — clearing the toolbar's override must
  // restore that state, never strip it.
  it("clear restores a pre-existing inline theme instead of stripping it", () => {
    const root = document.documentElement;
    root.style.setProperty("--color-accent-500", "#123456");
    root.dataset.selectStyle = "fill";

    const sakura = themeFixtureByKey("sakura");
    if (!sakura) throw new Error("sakura fixture missing");
    applyThemeFixtureToRoot(sakura);
    expect(root.style.getPropertyValue("--color-accent-500")).toBe("#e91e7a");
    expect(root.dataset.selectStyle).toBe(sakura.selectStyle);

    clearThemeFixtureFromRoot();
    expect(root.style.getPropertyValue("--color-accent-500")).toBe("#123456");
    expect(root.dataset.selectStyle).toBe("fill");

    root.style.removeProperty("--color-accent-500");
    delete root.dataset.selectStyle;
  });
});
