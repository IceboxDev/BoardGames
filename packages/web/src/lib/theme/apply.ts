import { isDefaultTheme, type ThemeConfig } from "./config.ts";
import { deriveAccentRamp, hexToRgb } from "./ramp.ts";
import { getFont, getPattern } from "./registry.ts";
import { loadWallpaper, saveResolvedVars } from "./storage.ts";

// ── applyTheme ───────────────────────────────────────────────────────────
//
// Writes the whole theme onto `document.documentElement` as inline custom
// properties. Tailwind v4 compiles a COLOR utility to `var(--color-*)`, so
// overriding the vars on :root rethemes every class-based color in the app —
// no runtime class assembly anywhere.
//
// Not every utility family works that way, which decides what belongs here.
// A SHADOW utility is compiled by inlining the token's value
// (`--tw-shadow: 0 0 12px -4px var(--tw-shadow-color, <value>)`), never as
// `var(--shadow-glow-accent)` — so setting that token at runtime is a no-op.
// The glow family therefore derives from the palette in CSS instead (see the
// `@theme static` block in index.css) and is deliberately absent below.
//
// When the config IS the stock look, every override is REMOVED instead, so
// Classic renders from the static `@theme` fallbacks in index.css and stays
// byte-identical to the pre-theming app (clean :root, no datasets, stock root
// font size).

// Avatar corners are deliberately absent from everything below: profile
// pictures are generated pre-cropped to a circle, so they stay round under
// every theme (see components/ui/Avatar.tsx).
//
// Radius knobs ship as SCALE factors, not absolute radii: primitives keep
// their distinct base radii and multiply by the factor
// (`calc(<base> * var(--radius-…-scale, 1))`), so one knob can't collapse
// every component to a single radius. The config stores px for the settings
// sliders; the division to a factor happens here only.
const RADIUS_CARD_BASE_PX = 12;
const RADIUS_UI_BASE_PX = 8;

function formatScale(value: number): string {
  return String(Number(value.toFixed(4)));
}

/** Every var this module may set — the cleanup list for the Classic path. */
const MANAGED_VARS = [
  "--color-surface-950",
  "--color-surface-900",
  "--color-surface-800",
  "--color-surface-700",
  "--color-surface-600",
  "--color-fg-primary",
  "--color-fg-secondary",
  "--color-fg-muted",
  "--color-fg-disabled",
  "--color-accent-100",
  "--color-accent-200",
  "--color-accent-300",
  "--color-accent-400",
  "--color-accent-500",
  "--color-neon-cyan",
  "--color-neon-purple",
  "--color-neon-pink",
  "--font-body",
  "--font-display",
  "--bg-pattern-image",
  "--bg-pattern-color",
  "--bg-pattern-size",
  "--radius-card-scale",
  "--radius-ui-scale",
  "--scrollbar-thumb",
  "--scrollbar-thumb-hover",
] as const;

function alphaRgb(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

function setThemeColorMeta(hex: string): void {
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", hex);
}

/** Resolve the pattern/wallpaper layer for `.bg-grid`'s first background slot. */
function resolvePatternLayer(
  config: ThemeConfig,
): { image: string; size: string; fromWallpaper: boolean } | null {
  if (config.wallpaper) {
    const wallpaper = loadWallpaper();
    if (wallpaper) return { image: `url("${wallpaper}")`, size: "cover", fromWallpaper: true };
  }
  if (config.pattern !== "none") {
    const pattern = getPattern(config.pattern);
    if (pattern) {
      return {
        image: pattern.generate(config.patternColor, config.patternOpacity),
        size: "auto",
        fromWallpaper: false,
      };
    }
  }
  return null;
}

export function applyTheme(config: ThemeConfig): void {
  const root = document.documentElement;

  if (isDefaultTheme(config)) {
    for (const name of MANAGED_VARS) root.style.removeProperty(name);
    root.style.removeProperty("font-size");
    delete root.dataset.selectStyle;
    delete root.dataset.ambient;
    setThemeColorMeta(config.surface950);
    saveResolvedVars(null);
    window.dispatchEvent(new CustomEvent("themechange"));
    return;
  }

  const vars: Record<string, string> = {
    "--color-surface-950": config.surface950,
    "--color-surface-900": config.surface900,
    "--color-surface-800": config.surface800,
    "--color-surface-700": config.surface700,
    "--color-surface-600": config.surface600,
    "--color-fg-primary": config.fgPrimary,
    "--color-fg-secondary": config.fgSecondary,
    "--color-fg-muted": config.fgMuted,
    "--color-fg-disabled": config.fgDisabled,
    "--color-neon-cyan": config.neonCyan,
    "--color-neon-purple": config.neonPurple,
    "--color-neon-pink": config.neonPink,
    // The document scrollbar follows the text ramp (see index.css fallbacks).
    "--scrollbar-thumb": alphaRgb(config.fgPrimary, 0.12),
    "--scrollbar-thumb-hover": alphaRgb(config.fgPrimary, 0.22),
  };

  // At the stock radii the scale is exactly 1 — leave the vars unset so the
  // primitives' `var(…-scale, 1)` fallback carries Classic untouched.
  if (config.radiusCard !== RADIUS_CARD_BASE_PX) {
    vars["--radius-card-scale"] = formatScale(config.radiusCard / RADIUS_CARD_BASE_PX);
  }
  if (config.radiusUi !== RADIUS_UI_BASE_PX) {
    vars["--radius-ui-scale"] = formatScale(config.radiusUi / RADIUS_UI_BASE_PX);
  }

  const ramp = deriveAccentRamp(config.accent);
  for (const step of ["100", "200", "300", "400", "500"] as const) {
    vars[`--color-accent-${step}`] = ramp[step];
  }

  const fontStack = getFont(config.fontFamily).stack;
  vars["--font-body"] = fontStack;
  vars["--font-display"] = fontStack;

  const patternLayer = resolvePatternLayer(config);
  if (patternLayer) {
    vars["--bg-pattern-image"] = patternLayer.image;
    vars["--bg-pattern-size"] = patternLayer.size;
    vars["--bg-pattern-color"] = config.patternColor;
  }

  for (const name of MANAGED_VARS) {
    const value = vars[name];
    if (value === undefined) root.style.removeProperty(name);
    else root.style.setProperty(name, value);
  }

  const fontSize = config.baseFontSize !== 16 ? `${config.baseFontSize}px` : null;
  if (fontSize) root.style.fontSize = fontSize;
  else root.style.removeProperty("font-size");

  root.dataset.selectStyle = config.selectionStyle;
  root.dataset.ambient = config.ambientMode;

  setThemeColorMeta(config.surface950);

  // The wallpaper data URL is already stored under its own key (up to 2MB).
  // Persisting it a SECOND time inside the pre-paint vars would put ~4MB of a
  // ~5MB origin budget into one theme, starving the React Query persister and
  // making this very write fail — which would silently leave the anti-flash
  // mirror holding the PREVIOUS theme. Persist a marker instead; the
  // index.html script re-reads the wallpaper key and rebuilds the url().
  const usedWallpaper = patternLayer?.fromWallpaper === true;
  const persistedVars = { ...vars };
  if (usedWallpaper) delete persistedVars["--bg-pattern-image"];
  saveResolvedVars({
    vars: persistedVars,
    wallpaper: usedWallpaper,
    fontSize,
    datasets: { selectStyle: config.selectionStyle, ambient: config.ambientMode },
    themeColor: config.surface950,
  });

  window.dispatchEvent(new CustomEvent("themechange"));
}
