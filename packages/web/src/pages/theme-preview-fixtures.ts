import type { CSSProperties } from "react";

// Fixture palettes for the dev-only theme verification surfaces
// (/dev/theme-preview and the /dev/ui?themes=1 preset toolbar).
//
// DELIBERATELY duplicated data: these values are frozen snapshots of what a
// site theme looks like, NOT imports from the theme engine (a parallel
// in-flight unit that will live under `lib/theme/`; it does not exist on this
// branch). The preview must keep rendering — and keep meaning the same thing —
// even if the engine's own preset list changes, so nothing here may import
// from it. The only contract shared with it is the CSS custom-property names
// below plus the `data-select-style` attribute. Because CSS variables inherit,
// setting the full set inline on a wrapper (or on <html>) rethemes every
// primitive inside it with zero component changes — that inheritance is the
// entire mechanism, and also the thing this page exists to eyeball.
//
// Radius knobs: `--radius-card-scale` / `--radius-ui-scale` are UNITLESS
// multipliers over the primitives' default corner radii, and
// `--avatar-radius` is the avatar corner length (`rounded-full` compiles to a
// literal, so avatars need their own var). Their consumer is the primitives
// unit's `components/ui/radii.ts` (merged as PR #5; not yet on this branch).
//
// `--shadow-glow-accent` mirrors the index.css glow token. NOTE the Tailwind
// v4 gotcha: a `--shadow-*` declared in `@theme` is INLINED into its utility
// (`.shadow-glow-accent` compiles to a literal `rgb(99 102 241 / 0.5)`, not
// `var(--shadow-glow-accent)`), so overriding the property does NOT retint the
// `shadow-glow-accent` class. Call sites that want a palette-following glow
// must read the var explicitly — `shadow-[var(--shadow-glow-accent)]`, as the
// preview's own glow swatch does. Until the primitives unit switches
// `TONE_GLOW.accent` over, accent glows elsewhere (SelectableCard hover, an
// `emphasizeActive` SegmentedControl) stay indigo under every fixture; that is
// a known gap, not broken propagation.

/** Every custom property a theme must define, in display order. */
export const THEME_VAR_NAMES = [
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
  "--radius-card-scale",
  "--radius-ui-scale",
  "--avatar-radius",
  "--shadow-glow-accent",
] as const;

export type ThemeVarName = (typeof THEME_VAR_NAMES)[number];

export const SELECT_STYLES = ["bar", "glow", "border", "fill", "underline"] as const;
export type SelectStyle = (typeof SELECT_STYLES)[number];

export type ThemeFixture = {
  key: string;
  label: string;
  /** One-line mood description shown in the preview section header. */
  blurb: string;
  /** The selected-state treatment this palette pairs with by default. */
  selectStyle: SelectStyle;
  vars: Record<ThemeVarName, string>;
};

type PaletteShorthand = {
  surfaces: [string, string, string, string, string]; // 950 → 600
  fg: [string, string, string, string]; // primary → disabled
  accent: [string, string, string, string, string]; // 100 → 500
  neons: [string, string, string]; // cyan, purple, pink
  /** Unitless multiplier over the primitives' default radii; 0 = square. */
  radiusScale: number;
  avatarRadius: string;
};

/** The index.css accent-glow token, rebuilt from the fixture's accent-500. */
function glowFromAccent(hex: string): string {
  return `0 0 12px -4px color-mix(in srgb, ${hex} 50%, transparent)`;
}

function vars(p: PaletteShorthand): Record<ThemeVarName, string> {
  return {
    "--color-surface-950": p.surfaces[0],
    "--color-surface-900": p.surfaces[1],
    "--color-surface-800": p.surfaces[2],
    "--color-surface-700": p.surfaces[3],
    "--color-surface-600": p.surfaces[4],
    "--color-fg-primary": p.fg[0],
    "--color-fg-secondary": p.fg[1],
    "--color-fg-muted": p.fg[2],
    "--color-fg-disabled": p.fg[3],
    "--color-accent-100": p.accent[0],
    "--color-accent-200": p.accent[1],
    "--color-accent-300": p.accent[2],
    "--color-accent-400": p.accent[3],
    "--color-accent-500": p.accent[4],
    "--color-neon-cyan": p.neons[0],
    "--color-neon-purple": p.neons[1],
    "--color-neon-pink": p.neons[2],
    "--radius-card-scale": String(p.radiusScale),
    "--radius-ui-scale": String(p.radiusScale),
    "--avatar-radius": p.avatarRadius,
    "--shadow-glow-accent": glowFromAccent(p.accent[4]),
  };
}

export const THEME_FIXTURES: ThemeFixture[] = [
  {
    key: "classic",
    label: "Classic",
    blurb: "The shipped look — indigo accent on near-black blue-grays.",
    selectStyle: "bar",
    vars: vars({
      surfaces: ["#08090d", "#0f1117", "#171923", "#1f2233", "#2a2d42"],
      fg: ["#e2e6ee", "#9aa3b4", "#6b7387", "#495164"],
      accent: ["#e0e7ff", "#c7d2fe", "#a5b4fc", "#818cf8", "#6366f1"],
      neons: ["#22d3ee", "#a855f7", "#ec4899"],
      radiusScale: 1,
      avatarRadius: "9999px",
    }),
  },
  {
    key: "midnight",
    label: "Midnight",
    blurb: "Deep navy blues with a steel-blue accent.",
    selectStyle: "glow",
    vars: vars({
      surfaces: ["#0a0e1a", "#0e1426", "#141c33", "#1b2542", "#253055"],
      fg: ["#dde6f5", "#93a5c4", "#64769b", "#46557a"],
      accent: ["#e4eefd", "#c8d9fb", "#a3c0f7", "#7da6f2", "#5b8dee"],
      neons: ["#38bdf8", "#818cf8", "#f472b6"],
      radiusScale: 1.25,
      avatarRadius: "9999px",
    }),
  },
  {
    key: "ocean",
    label: "Ocean",
    blurb: "Abyssal teal depths with a bright cyan accent.",
    selectStyle: "fill",
    vars: vars({
      surfaces: ["#071318", "#0b1c23", "#102831", "#163541", "#1e4452"],
      fg: ["#d9f0f4", "#8fb4bd", "#5f8791", "#40626c"],
      accent: ["#d4f6fa", "#a5eaf3", "#67dbeb", "#26cbe0", "#00bcd4"],
      neons: ["#00e5ff", "#7c4dff", "#ff4081"],
      radiusScale: 1.5,
      avatarRadius: "9999px",
    }),
  },
  {
    key: "ember",
    label: "Ember",
    blurb: "Warm charcoal browns with a brass-gold accent.",
    selectStyle: "border",
    vars: vars({
      surfaces: ["#1a1816", "#221f1b", "#2c2822", "#38322a", "#453e33"],
      fg: ["#ece3d3", "#b0a48e", "#7d7362", "#574f42"],
      accent: ["#f7efe2", "#eddcc5", "#e1c6a0", "#d5b07c", "#c89b5e"],
      neons: ["#5eead4", "#c084fc", "#fb7185"],
      radiusScale: 0.75,
      avatarRadius: "0.5rem",
    }),
  },
  {
    key: "terminal",
    label: "Terminal",
    blurb: "Pure black phosphor CRT — square corners, green glow.",
    selectStyle: "underline",
    vars: vars({
      surfaces: ["#000000", "#050807", "#0a120d", "#102016", "#16301f"],
      fg: ["#d7ffe9", "#7dd8a6", "#4a9a72", "#2c6247"],
      accent: ["#ccffe7", "#99ffcf", "#66ffb8", "#33ffa0", "#00ff88"],
      neons: ["#00ffee", "#9d00ff", "#ff0066"],
      radiusScale: 0,
      avatarRadius: "0px",
    }),
  },
  {
    key: "cyberpunk",
    label: "Cyberpunk",
    blurb: "Neon-noir violet blacks with a hot magenta accent.",
    selectStyle: "glow",
    vars: vars({
      surfaces: ["#0a0a0f", "#101019", "#181826", "#222236", "#2e2e4a"],
      fg: ["#f2e9f5", "#b8a8c8", "#82719a", "#59506f"],
      accent: ["#ffe0ef", "#ffb3d9", "#ff85c2", "#ff57aa", "#ff2d95"],
      neons: ["#00f0ff", "#bf00ff", "#ff2d95"],
      radiusScale: 0.5,
      avatarRadius: "0.25rem",
    }),
  },
  {
    key: "sakura",
    label: "Sakura",
    blurb: "Plum-dark rosewood with a cherry-blossom pink accent.",
    selectStyle: "fill",
    vars: vars({
      surfaces: ["#1a0a10", "#231018", "#2f1721", "#3d1f2c", "#4d2939"],
      fg: ["#f7e6ed", "#cba3b3", "#96707f", "#6a4c58"],
      accent: ["#fce0ec", "#f8b3d0", "#f37fb1", "#ee4b92", "#e91e7a"],
      neons: ["#67e8f9", "#d8b4fe", "#f9a8d4"],
      radiusScale: 2,
      avatarRadius: "9999px",
    }),
  },
  {
    key: "nord",
    label: "Nord",
    blurb: "Polar-night slate blues with a frost cyan accent.",
    selectStyle: "border",
    vars: vars({
      surfaces: ["#2e3440", "#353c4a", "#3b4252", "#434c5e", "#4c566a"],
      fg: ["#eceff4", "#d8dee9", "#a3aebf", "#7b8598"],
      accent: ["#e2f1f5", "#cbe3ea", "#b4d7e1", "#9ecbd8", "#88c0d0"],
      neons: ["#8fbcbb", "#b48ead", "#bf616a"],
      radiusScale: 0.75,
      avatarRadius: "9999px",
    }),
  },
  {
    key: "dawn",
    label: "Dawn",
    blurb: "Light-leaning dusk mauve with a sunrise-orange accent.",
    selectStyle: "bar",
    vars: vars({
      surfaces: ["#3a3540", "#443e4a", "#4f4856", "#5c5464", "#6b6274"],
      fg: ["#f5eeea", "#d3c8c2", "#a99c96", "#7f746f"],
      accent: ["#feeede", "#fcdbbd", "#fac897", "#f8b571", "#f6a24b"],
      neons: ["#7dd3fc", "#c4b5fd", "#fda4af"],
      radiusScale: 1.25,
      avatarRadius: "9999px",
    }),
  },
];

export function themeFixtureByKey(key: string | null): ThemeFixture | undefined {
  return THEME_FIXTURES.find((f) => f.key === key);
}

/** The fixture's vars as an inline-style object (CSS custom props inherit). */
export function themeVarStyle(fixture: ThemeFixture): CSSProperties {
  return { ...fixture.vars } as CSSProperties;
}

// Snapshot of the root's inline theme state before the first fixture apply.
// Post-merge, the theme engine applies the user's REAL theme through the same
// documentElement inline vars — so clearing must restore what was there, not
// strip everything, and must be a no-op if no fixture was ever applied.
type RootThemeSnapshot = {
  vars: Record<ThemeVarName, string>; // prior inline values ("" = unset)
  selectStyle: string | undefined;
};

let rootSnapshot: RootThemeSnapshot | null = null;

/**
 * Apply a fixture globally by writing its vars + `data-select-style` onto
 * `document.documentElement` — plain DOM on purpose, so the /dev/ui toolbar
 * exercises the exact inheritance mechanism without touching the engine.
 */
export function applyThemeFixtureToRoot(fixture: ThemeFixture): void {
  const root = document.documentElement;
  if (!rootSnapshot) {
    const prior = {} as Record<ThemeVarName, string>;
    for (const name of THEME_VAR_NAMES) {
      prior[name] = root.style.getPropertyValue(name);
    }
    rootSnapshot = { vars: prior, selectStyle: root.dataset.selectStyle };
  }
  for (const name of THEME_VAR_NAMES) {
    root.style.setProperty(name, fixture.vars[name]);
  }
  root.dataset.selectStyle = fixture.selectStyle;
}

/** Undo `applyThemeFixtureToRoot`, restoring the pre-apply inline state. */
export function clearThemeFixtureFromRoot(): void {
  if (!rootSnapshot) return;
  const root = document.documentElement;
  for (const name of THEME_VAR_NAMES) {
    const prior = rootSnapshot.vars[name];
    if (prior) {
      root.style.setProperty(name, prior);
    } else {
      root.style.removeProperty(name);
    }
  }
  if (rootSnapshot.selectStyle === undefined) {
    delete root.dataset.selectStyle;
  } else {
    root.dataset.selectStyle = rootSnapshot.selectStyle;
  }
  rootSnapshot = null;
}
