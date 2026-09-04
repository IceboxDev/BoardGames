import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme } from "./apply.ts";
import { DEFAULT_THEME, type ThemeConfig } from "./config.ts";
import { THEME_VARS_STORAGE_KEY, WALLPAPER_STORAGE_KEY } from "./storage.ts";

const root = () => document.documentElement;

function readPersistedVars(): {
  vars: Record<string, string>;
  wallpaper: boolean;
  fontSize: string | null;
} | null {
  const raw = localStorage.getItem(THEME_VARS_STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}

beforeEach(() => {
  root().removeAttribute("style");
  root().removeAttribute("data-select-style");
  root().removeAttribute("data-ambient");
});

describe("applyTheme", () => {
  it("leaves :root completely clean for the stock look", () => {
    // Classic must be byte-identical to the pre-theming app: no inline
    // overrides at all, so the static @theme fallbacks in index.css win.
    applyTheme({ ...DEFAULT_THEME, accent: "#10b981" });
    expect(root().getAttribute("style")).not.toBe("");

    applyTheme(DEFAULT_THEME);
    expect(root().getAttribute("style")).toBe("");
    expect(root().dataset.selectStyle).toBeUndefined();
    expect(root().dataset.ambient).toBeUndefined();
    expect(localStorage.getItem(THEME_VARS_STORAGE_KEY)).toBeNull();
  });

  it("writes the palette, the derived accent ramp and the datasets", () => {
    applyTheme({
      ...DEFAULT_THEME,
      surface950: "#0a0e1a",
      accent: "#5b8dee",
      selectionStyle: "glow",
    });
    const style = root().style;
    expect(style.getPropertyValue("--color-surface-950")).toBe("#0a0e1a");
    expect(style.getPropertyValue("--color-accent-500")).toBe("#5b8dee");
    // The ramp is derived, not stored — 400 must be a lighter sibling.
    expect(style.getPropertyValue("--color-accent-400")).toMatch(/^#[0-9a-f]{6}$/);
    expect(root().dataset.selectStyle).toBe("glow");
  });

  it("never sets the shadow-glow token (Tailwind inlines shadow values)", () => {
    // A shadow utility bakes its value at build time, so overriding this at
    // runtime is a no-op — the glow derives from --color-accent-500 in CSS.
    applyTheme({ ...DEFAULT_THEME, accent: "#5b8dee" });
    expect(root().style.getPropertyValue("--shadow-glow-accent")).toBe("");
  });

  it("emits radius SCALE factors, and only when they differ from the base", () => {
    applyTheme({ ...DEFAULT_THEME, accent: "#5b8dee" });
    expect(root().style.getPropertyValue("--radius-card-scale")).toBe("");

    applyTheme({ ...DEFAULT_THEME, radiusCard: 24, radiusUi: 4 });
    expect(root().style.getPropertyValue("--radius-card-scale")).toBe("2");
    expect(root().style.getPropertyValue("--radius-ui-scale")).toBe("0.5");
  });

  it("only overrides the root font size when it is not 16px", () => {
    applyTheme({ ...DEFAULT_THEME, accent: "#5b8dee" });
    expect(root().style.fontSize).toBe("");
    applyTheme({ ...DEFAULT_THEME, baseFontSize: 20 });
    expect(root().style.fontSize).toBe("20px");
  });

  it("dispatches themechange after every apply", () => {
    let count = 0;
    const onChange = () => {
      count += 1;
    };
    window.addEventListener("themechange", onChange);
    applyTheme({ ...DEFAULT_THEME, accent: "#5b8dee" });
    applyTheme(DEFAULT_THEME);
    window.removeEventListener("themechange", onChange);
    expect(count).toBe(2);
  });

  it("keeps the wallpaper image out of the pre-paint vars payload", () => {
    // The image already costs up to 2MB under its own key; duplicating it into
    // the mirror would blow the origin quota and silently poison both writes.
    const image = `data:image/png;base64,${"A".repeat(500)}`;
    localStorage.setItem(WALLPAPER_STORAGE_KEY, image);
    const config: ThemeConfig = { ...DEFAULT_THEME, wallpaper: true, accent: "#5b8dee" };

    applyTheme(config);

    // The live var still carries the image, so the page renders it...
    expect(root().style.getPropertyValue("--bg-pattern-image")).toContain(image);
    // ...but the persisted payload only carries the marker.
    const persisted = readPersistedVars();
    expect(persisted?.wallpaper).toBe(true);
    expect(persisted?.vars["--bg-pattern-image"]).toBeUndefined();
    expect(JSON.stringify(persisted)).not.toContain(image);
  });
});
