import { ThemeConfigSchema } from "@boardgames/core/protocol";
import type { ComponentType } from "react";
import { DEFAULT_THEME, type ThemeConfig } from "./config.ts";

// ── Theme registry ───────────────────────────────────────────────────────
//
// Discovers the pluggable pieces of the theme system via `import.meta.glob`,
// so presets / patterns / fonts / extensions / ambient effects are added by
// DROPPING A FILE in the matching directory — no central list to edit.
//
// Every module is shape-validated at load and silently skipped when invalid
// (a broken preset must never take the app down); dev builds log a warning.
// Directories may be empty — every listing degrades to its built-ins.
//
// Contracts (module DEFAULT export):
//   presets/*.ts      { key, label, order, config }   plain object, NO imports;
//                     `config` may be partial — it is merged over DEFAULT_THEME
//                     and validated through ThemeConfigSchema.
//   patterns/*.ts     { key, label, tile, generate(colorHex, opacity) → "url(data:image/svg+xml,…)" }
//   fonts/*.ts        { key, label, stack, load?: () => Promise<unknown> }
//   extensions/*.ts(x){ key, useAccentOverride(active: boolean) => string | null }
//   ../../components/ambient/effects/*.tsx
//                     { key, label, tier: "cheap" | "rich", Component }
//                     Component renders an absolute inset-0 pointer-events-none
//                     layer. Loaded lazily (dynamic glob) so effects stay out
//                     of the entry chunk.

export interface ThemePresetDef {
  key: string;
  label: string;
  order: number;
  config: ThemeConfig;
}

export interface ThemePatternDef {
  key: string;
  label: string;
  /** Tile edge in px (metadata for thumbnails; the SVG carries its own size). */
  tile?: number;
  generate: (colorHex: string, opacity: number) => string;
}

export interface ThemeFontDef {
  key: string;
  label: string;
  stack: string;
  load?: () => Promise<unknown>;
}

export interface ThemeExtensionDef {
  key: string;
  /**
   * React hook, called unconditionally on every provider render (rules of
   * hooks). `active` is true while the user's accentMode is "night-sync";
   * the extension gates its own data fetching on it and returns null when
   * inactive (or when it has no override to contribute).
   */
  useAccentOverride: (active: boolean) => string | null;
}

export interface AmbientEffectDef {
  key: string;
  label: string;
  tier: "cheap" | "rich";
  Component: ComponentType;
}

/** Today's body/display face — the guaranteed fallback font. */
export const INTER_FONT: ThemeFontDef = {
  key: "inter",
  label: "Inter",
  stack: '"Inter Variable", "Inter", sans-serif',
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function warnSkip(kind: string, path: string): void {
  if (import.meta.env.DEV) {
    console.warn(`[theme] skipping invalid ${kind} module: ${path}`);
  }
}

/** Stable iteration over an eager glob result: path-sorted [path, default]. */
function defaultExports(modules: Record<string, unknown>): [string, unknown][] {
  return Object.keys(modules)
    .sort()
    .map((path) => {
      const mod = modules[path];
      return [path, isRecord(mod) ? mod.default : undefined];
    });
}

// ── Presets ──────────────────────────────────────────────────────────────

// Every discovery glob EXCLUDES test files: the data directories carry their
// own vitest specs, and eagerly importing one outside a runner would execute
// top-level describe() and take the app down (and drag vitest into the chunk).
const presetModules = import.meta.glob(["./presets/*.ts", "!./presets/*.test.ts"], {
  eager: true,
}) as Record<string, unknown>;

const PRESETS: ThemePresetDef[] = (() => {
  const byKey = new Map<string, ThemePresetDef>();
  for (const [path, raw] of defaultExports(presetModules)) {
    if (
      !isRecord(raw) ||
      typeof raw.key !== "string" ||
      raw.key.length === 0 ||
      typeof raw.label !== "string" ||
      typeof raw.order !== "number" ||
      !isRecord(raw.config)
    ) {
      warnSkip("preset", path);
      continue;
    }
    const parsed = ThemeConfigSchema.safeParse({
      ...DEFAULT_THEME,
      ...raw.config,
      preset: raw.key,
    });
    if (!parsed.success) {
      warnSkip("preset", path);
      continue;
    }
    if (byKey.has(raw.key)) {
      warnSkip("duplicate preset", path);
      continue;
    }
    byKey.set(raw.key, {
      key: raw.key,
      label: raw.label,
      order: raw.order,
      config: parsed.data,
    });
  }
  return [...byKey.values()].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
})();

export function listPresets(): readonly ThemePresetDef[] {
  return PRESETS;
}

export function getPreset(key: string): ThemePresetDef | undefined {
  return PRESETS.find((p) => p.key === key);
}

// ── Patterns ─────────────────────────────────────────────────────────────

const patternModules = import.meta.glob(["./patterns/*.ts", "!./patterns/*.test.ts"], {
  eager: true,
}) as Record<string, unknown>;

const PATTERNS: ThemePatternDef[] = (() => {
  const byKey = new Map<string, ThemePatternDef>();
  for (const [path, raw] of defaultExports(patternModules)) {
    if (
      !isRecord(raw) ||
      typeof raw.key !== "string" ||
      raw.key.length === 0 ||
      raw.key === "none" ||
      typeof raw.label !== "string" ||
      typeof raw.generate !== "function"
    ) {
      warnSkip("pattern", path);
      continue;
    }
    if (byKey.has(raw.key)) {
      warnSkip("duplicate pattern", path);
      continue;
    }
    byKey.set(raw.key, {
      key: raw.key,
      label: raw.label,
      tile: typeof raw.tile === "number" ? raw.tile : undefined,
      generate: raw.generate as ThemePatternDef["generate"],
    });
  }
  return [...byKey.values()];
})();

export function listPatterns(): readonly ThemePatternDef[] {
  return PATTERNS;
}

export function getPattern(key: string): ThemePatternDef | undefined {
  return PATTERNS.find((p) => p.key === key);
}

// ── Fonts ────────────────────────────────────────────────────────────────

const fontModules = import.meta.glob(["./fonts/*.ts", "!./fonts/*.test.ts"], {
  eager: true,
}) as Record<string, unknown>;

const FONTS: ThemeFontDef[] = (() => {
  const byKey = new Map<string, ThemeFontDef>();
  for (const [path, raw] of defaultExports(fontModules)) {
    if (
      !isRecord(raw) ||
      typeof raw.key !== "string" ||
      raw.key.length === 0 ||
      typeof raw.label !== "string" ||
      typeof raw.stack !== "string" ||
      raw.stack.length === 0 ||
      (raw.load !== undefined && typeof raw.load !== "function")
    ) {
      warnSkip("font", path);
      continue;
    }
    if (byKey.has(raw.key)) {
      warnSkip("duplicate font", path);
      continue;
    }
    byKey.set(raw.key, {
      key: raw.key,
      label: raw.label,
      stack: raw.stack,
      load: raw.load as ThemeFontDef["load"],
    });
  }
  // The default face must always resolve, even with an empty fonts/ dir.
  if (!byKey.has(INTER_FONT.key)) byKey.set(INTER_FONT.key, INTER_FONT);
  return [...byKey.values()];
})();

export function listFonts(): readonly ThemeFontDef[] {
  return FONTS;
}

export function getFont(key: string): ThemeFontDef {
  return FONTS.find((f) => f.key === key) ?? INTER_FONT;
}

// ── Extensions (accent override hooks) ───────────────────────────────────

const extensionModules = import.meta.glob(
  ["./extensions/*.ts", "./extensions/*.tsx", "!./extensions/*.test.*"],
  { eager: true },
) as Record<string, unknown>;

const EXTENSIONS: ThemeExtensionDef[] = (() => {
  const byKey = new Map<string, ThemeExtensionDef>();
  for (const [path, raw] of defaultExports(extensionModules)) {
    if (
      !isRecord(raw) ||
      typeof raw.key !== "string" ||
      raw.key.length === 0 ||
      typeof raw.useAccentOverride !== "function"
    ) {
      warnSkip("extension", path);
      continue;
    }
    if (byKey.has(raw.key)) {
      warnSkip("duplicate extension", path);
      continue;
    }
    byKey.set(raw.key, {
      key: raw.key,
      useAccentOverride: raw.useAccentOverride as ThemeExtensionDef["useAccentOverride"],
    });
  }
  return [...byKey.values()];
})();

/**
 * Stable, build-static list (glob order). The provider renders one probe
 * component per entry, so the hook call order never changes across renders.
 */
export function listExtensions(): readonly ThemeExtensionDef[] {
  return EXTENSIONS;
}

// ── Ambient effects (lazy) ───────────────────────────────────────────────

const ambientModules = import.meta.glob([
  "../../components/ambient/effects/*.tsx",
  "!../../components/ambient/effects/*.test.*",
]) as Record<string, () => Promise<unknown>>;

let ambientCache: Promise<readonly AmbientEffectDef[]> | null = null;

/** Load + validate every ambient effect module (cached after first call). */
export function loadAmbientEffects(): Promise<readonly AmbientEffectDef[]> {
  if (!ambientCache) {
    ambientCache = Promise.all(
      Object.keys(ambientModules)
        .sort()
        .map(async (path) => {
          try {
            const mod = await ambientModules[path]();
            const raw = isRecord(mod) ? mod.default : undefined;
            if (
              !isRecord(raw) ||
              typeof raw.key !== "string" ||
              raw.key.length === 0 ||
              typeof raw.label !== "string" ||
              (raw.tier !== "cheap" && raw.tier !== "rich") ||
              typeof raw.Component !== "function"
            ) {
              warnSkip("ambient effect", path);
              return null;
            }
            return {
              key: raw.key,
              label: raw.label,
              tier: raw.tier,
              Component: raw.Component as ComponentType,
            } satisfies AmbientEffectDef;
          } catch {
            warnSkip("ambient effect", path);
            return null;
          }
        }),
    ).then((defs) => {
      const byKey = new Map<string, AmbientEffectDef>();
      for (const def of defs) {
        if (def && !byKey.has(def.key)) byKey.set(def.key, def);
      }
      return [...byKey.values()];
    });
  }
  return ambientCache;
}
