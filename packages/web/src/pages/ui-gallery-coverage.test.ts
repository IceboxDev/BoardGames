import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The gallery (/dev/ui) is the per-primitive visual-regression surface, so a
// primitive that is not on it changes invisibly. This pins the contract: every
// component or hook exported from `components/ui/index.ts` is rendered (or
// invoked) somewhere in UiGalleryPage.tsx. Add a section when you add an
// export; add to the allowlist only for an export that genuinely cannot be
// shown on a page of its own — and say why.

const SRC = join(__dirname, "..");

const NOT_A_SPECIMEN: Record<string, string> = {
  DialogBackdrop: "the scrim inside Modal/Drawer/Overlay — shown whenever any of those is open",
  BoardOverlay: "an SVG-board overlay that needs a BoardSurface host; covered by the board games",
};

function uiExports(): string[] {
  const src = readFileSync(join(SRC, "components/ui/index.ts"), "utf8");
  const names: string[] = [];
  for (const m of src.matchAll(/export \{([^}]*)\}/g)) {
    for (const raw of (m[1] ?? "").split(",")) {
      const spec = raw.trim();
      if (!spec || spec.startsWith("type ")) continue;
      const name = (spec.split(" as ").pop() ?? spec).trim();
      // Components (PascalCase) and hooks (useX); constants/maps are not specimens.
      if (/^[A-Z][A-Za-z0-9]*$/.test(name) || /^use[A-Z]/.test(name)) names.push(name);
    }
  }
  return names;
}

describe("UI gallery coverage", () => {
  const gallery = readFileSync(join(SRC, "pages/UiGalleryPage.tsx"), "utf8");
  const names = uiExports();

  it("finds the ui barrel's components", () => {
    expect(names.length).toBeGreaterThan(30);
  });

  it.each(names.filter((n) => !(n in NOT_A_SPECIMEN)))("renders %s", (name) => {
    const shown = /^use/.test(name)
      ? new RegExp(`\\b${name}\\(`).test(gallery)
      : new RegExp(`<${name}\\b`).test(gallery);
    expect(shown, `${name} is exported from components/ui but missing from /dev/ui`).toBe(true);
  });

  it("keeps the allowlist honest — every entry is still an export", () => {
    for (const name of Object.keys(NOT_A_SPECIMEN)) {
      expect(names, `${name} is allowlisted but no longer exported`).toContain(name);
    }
  });
});
