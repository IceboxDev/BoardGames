import { ThemeConfigSchema } from "@boardgames/core/protocol";
import { DEFAULT_THEME, isDefaultTheme, type ThemeConfig } from "./config.ts";

// ── localStorage mirror ──────────────────────────────────────────────────
//
// The server (`user_profiles.theme_json`) is the source of truth; this mirror
// exists so the theme paints on the FIRST frame (the index.html anti-flash
// script reads it) instead of after the profile query lands. Every accessor is
// quota-/privacy-mode-safe: storage can throw on read (blocked cookies) and on
// write (quota, private windows), and the theme must never take the app down.
//
//   bg-theme-v1            the ThemeConfig JSON (absent = Classic)
//   bg-theme-wallpaper-v1  wallpaper image data URL — never sent to the server
//   bg-theme-vars-v1       resolved CSS vars, written by applyTheme for the
//                          index.html pre-paint script (which cannot run the
//                          ramp/pattern/font resolution itself)

export const THEME_STORAGE_KEY = "bg-theme-v1";
export const WALLPAPER_STORAGE_KEY = "bg-theme-wallpaper-v1";
export const THEME_VARS_STORAGE_KEY = "bg-theme-vars-v1";

/** What the anti-flash script replays verbatim before first paint. */
export interface ResolvedThemeVars {
  vars: Record<string, string>;
  /**
   * True when the background layer is the user's wallpaper. The image itself
   * is deliberately NOT duplicated into `vars` (it already costs up to 2MB
   * under its own key); the anti-flash script rebuilds the `url()` from
   * `bg-theme-wallpaper-v1` when it sees this flag.
   */
  wallpaper: boolean;
  /** e.g. "17px"; null when the root font size is stock (16px). */
  fontSize: string | null;
  datasets: { selectStyle: string; ambient: string };
  /** surface950 — mirrored into <meta name="theme-color">. */
  themeColor: string;
}

/**
 * Read the mirrored config. Unknown keys are dropped and missing keys filled
 * from `DEFAULT_THEME` (forward/backward compatible); a corrupt or invalid
 * payload reads as "no mirror".
 */
export function loadStoredTheme(): ThemeConfig | null {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
    const merged = { ...DEFAULT_THEME, ...parsed };
    const result = ThemeConfigSchema.safeParse(merged);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/** Mirror the config; the stock look clears the key instead of storing it. */
export function saveStoredTheme(config: ThemeConfig): void {
  try {
    if (isDefaultTheme(config)) {
      localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(config));
    }
  } catch {
    // quota / private mode — the profile query will still theme the session
  }
}

export function loadWallpaper(): string | null {
  try {
    const raw = localStorage.getItem(WALLPAPER_STORAGE_KEY);
    return raw?.startsWith("data:image/") ? raw : null;
  } catch {
    return null;
  }
}

/** @returns false when the write failed (quota) so the UI can say so. */
export function saveWallpaper(dataUrl: string | null): boolean {
  try {
    if (dataUrl === null) {
      localStorage.removeItem(WALLPAPER_STORAGE_KEY);
    } else {
      localStorage.setItem(WALLPAPER_STORAGE_KEY, dataUrl);
    }
    return true;
  } catch {
    return false;
  }
}

export function saveResolvedVars(payload: ResolvedThemeVars | null): void {
  try {
    if (payload === null) {
      localStorage.removeItem(THEME_VARS_STORAGE_KEY);
    } else {
      localStorage.setItem(THEME_VARS_STORAGE_KEY, JSON.stringify(payload));
    }
  } catch {
    // best-effort: without it the next load themes on hydration instead of pre-paint
  }
}
