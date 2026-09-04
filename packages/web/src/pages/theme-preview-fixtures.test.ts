import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
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

// Vitest runs with cwd = packages/web (vite transforms import.meta.url into a
// non-file URL, so resolve from the package root instead).
function readIndexCss(): string {
  return readFileSync(join(process.cwd(), "src", "index.css"), "utf8");
}

describe("theme fixtures", () => {
  // Every DOM test below mutates documentElement and the module's snapshot
  // singleton. Reset both up front so a failure inside one test cannot
  // cascade into the next through leftover module state.
  beforeEach(() => {
    clearThemeFixtureFromRoot();
    const root = document.documentElement;
    for (const name of THEME_VAR_NAMES) root.style.removeProperty(name);
    delete root.dataset.selectStyle;
  });

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
    const css = readIndexCss();
    for (const name of THEME_VAR_NAMES) {
      if (!name.startsWith("--color-") && name !== "--shadow-glow-accent") continue;
      expect(css, `expected ${name} to be declared in index.css`).toContain(`${name}:`);
    }
  });

  // A real drift guard, not a change-detector: every --color-* in the
  // "classic" fixture is compared against the value actually declared in
  // index.css, so if the shipped palette moves, "classic" stops being the
  // shipped look and this fails.
  it("keeps the classic fixture pinned to the shipped index.css palette", () => {
    const classic = themeFixtureByKey("classic");
    if (!classic) throw new Error("classic fixture missing");
    const css = readIndexCss();
    let checked = 0;
    for (const name of THEME_VAR_NAMES) {
      if (!name.startsWith("--color-")) continue;
      const declared = css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]?.trim();
      expect(declared, `${name} should be declared in index.css`).toBeDefined();
      expect(classic.vars[name], `classic ${name} vs index.css`).toBe(declared);
      checked += 1;
    }
    // Guard the guard: a broken regex must not silently check nothing.
    expect(checked).toBe(17);
    // Scale 1 must be the identity multiplier.
    expect(classic.vars["--radius-card-scale"]).toBe("1");
    expect(classic.vars["--radius-ui-scale"]).toBe("1");
  });

  // index.css spells the glow as `rgb(99 102 241 / 0.5)` while the fixtures
  // generate the equivalent `color-mix(...)` from accent-500. Assert the
  // RELATIONSHIP (glow is built from this fixture's own accent), not a
  // hand-copied literal that would falsely claim to match the shipped token.
  it("derives each fixture's accent glow from its own accent-500", () => {
    for (const fixture of THEME_FIXTURES) {
      expect(fixture.vars["--shadow-glow-accent"]).toBe(
        `0 0 12px -4px color-mix(in srgb, ${fixture.vars["--color-accent-500"]} 50%, transparent)`,
      );
    }
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
  //
  // The seeded selectStyle ("glow") must DIFFER from the applied fixture's
  // ("fill" for sakura), or both assertions would hold even if apply/clear
  // never touched `dataset` at all.
  it("clear restores a pre-existing inline theme instead of stripping it", () => {
    const root = document.documentElement;
    const sakura = themeFixtureByKey("sakura");
    if (!sakura) throw new Error("sakura fixture missing");
    expect(sakura.selectStyle).not.toBe("glow");

    root.style.setProperty("--color-accent-500", "#123456");
    root.dataset.selectStyle = "glow";

    applyThemeFixtureToRoot(sakura);
    expect(root.style.getPropertyValue("--color-accent-500")).toBe("#e91e7a");
    expect(root.dataset.selectStyle).toBe(sakura.selectStyle);

    clearThemeFixtureFromRoot();
    expect(root.style.getPropertyValue("--color-accent-500")).toBe("#123456");
    expect(root.dataset.selectStyle).toBe("glow");
  });

  // The restore is conditional: whoever wrote last wins. Models the theme
  // engine re-theming while a fixture chip is pressed — reset must not revert
  // the user's real theme to whatever preceded the preview.
  it("clear leaves vars that changed after the fixture was applied", () => {
    const root = document.documentElement;
    const nord = themeFixtureByKey("nord");
    if (!nord) throw new Error("nord fixture missing");

    root.style.setProperty("--color-accent-500", "#111111");
    applyThemeFixtureToRoot(nord);
    // A third party (the engine) re-themes underneath us.
    root.style.setProperty("--color-accent-500", "#999999");

    clearThemeFixtureFromRoot();
    expect(root.style.getPropertyValue("--color-accent-500")).toBe("#999999");
  });
});
