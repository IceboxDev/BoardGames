import type { ThemeConfig } from "@boardgames/core/protocol";

// ── Theme config ─────────────────────────────────────────────────────────
//
// The single wire/storage shape for site personalization. The TYPE is derived
// from `ThemeConfigSchema` in core (`z.infer` — never re-declared), so the
// engine, the settings page, the localStorage mirror and the server column can
// never drift apart.
//
// `DEFAULT_THEME` is TODAY'S look, verbatim: every value below must equal the
// static fallbacks in `index.css`'s `@theme` block (surfaces, fg ramp,
// accent-500, neons, Inter, 16px root). `applyTheme` treats a config that
// deep-equals this object as "no overrides" and cleans `:root`, which is what
// keeps the Classic preset byte-identical to the pre-theming app.

export type { ThemeConfig };

export const DEFAULT_THEME: ThemeConfig = {
  preset: "classic",
  surface950: "#08090d",
  surface900: "#0f1117",
  surface800: "#171923",
  surface700: "#1f2233",
  surface600: "#2a2d42",
  fgPrimary: "#e2e6ee",
  fgSecondary: "#9aa3b4",
  fgMuted: "#6b7387",
  fgDisabled: "#495164",
  accent: "#6366f1",
  neonCyan: "#22d3ee",
  neonPurple: "#a855f7",
  neonPink: "#ec4899",
  pattern: "none",
  patternColor: "#6366f1",
  patternOpacity: 0.4,
  wallpaper: false,
  radiusCard: 12,
  radiusUi: 8,
  avatarShape: "circle",
  selectionStyle: "bar",
  fontFamily: "inter",
  baseFontSize: 16,
  ambientMode: "auto",
  ambientEffect: null,
  accentMode: "custom",
};

/** Every key, for exhaustive iteration (merge, equality, identity checks). */
export const THEME_KEYS = Object.keys(DEFAULT_THEME) as (keyof ThemeConfig)[];

/** True when `config` is exactly the stock look (field-by-field). */
export function isDefaultTheme(config: ThemeConfig): boolean {
  return THEME_KEYS.every((k) => config[k] === DEFAULT_THEME[k]);
}

/**
 * The fields that make a preset LOOK like itself. Changing one of these via
 * the custom controls flips the config to `preset: "custom"`; the remaining
 * knobs (ambient mode, accent mode, base font size) are personal comfort
 * settings a preset badge should survive.
 */
export const THEME_IDENTITY_KEYS: readonly (keyof ThemeConfig)[] = [
  "surface950",
  "surface900",
  "surface800",
  "surface700",
  "surface600",
  "fgPrimary",
  "fgSecondary",
  "fgMuted",
  "fgDisabled",
  "accent",
  "neonCyan",
  "neonPurple",
  "neonPink",
  "pattern",
  "patternColor",
  "patternOpacity",
  "radiusCard",
  "radiusUi",
  "avatarShape",
  "selectionStyle",
  "fontFamily",
];
