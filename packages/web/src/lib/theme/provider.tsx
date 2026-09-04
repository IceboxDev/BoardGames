import type { PublicProfile } from "@boardgames/core/protocol";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useCurrentUser } from "../../hooks/useCurrentUser.ts";
import { fetchProfile, updateMyProfile } from "../profile.ts";
import { qk } from "../query-keys.ts";
import { applyTheme } from "./apply.ts";
import { DEFAULT_THEME, isDefaultTheme, THEME_IDENTITY_KEYS, type ThemeConfig } from "./config.ts";
import {
  type AmbientEffectDef,
  getFont,
  getPreset,
  INTER_FONT,
  listExtensions,
  loadAmbientEffects,
  type ThemeExtensionDef,
} from "./registry.ts";
import { loadStoredTheme, saveStoredTheme } from "./storage.ts";

// ── ThemeProvider ────────────────────────────────────────────────────────
//
// Owns the live ThemeConfig for the session. Load order:
//   1. localStorage mirror, synchronously (the index.html anti-flash script
//      already painted these vars — this just seeds React state to match);
//   2. the profile query reconciles once it lands (server is source of truth,
//      unless a local edit is in flight).
// Save path: every change writes the mirror immediately and debounces a
// full-replace PUT /api/profiles/:userId built from the freshest cached
// profile row, so the theme rides the existing editable-profile pipe.
//
// Also mounts the ambient layer (a fixed, pointer-events-none, z-0 backdrop
// behind the page content) and runs every theme extension's
// `useAccentOverride` probe so night-sync accents can flow into the ramp.

const SAVE_DEBOUNCE_MS = 800;
/** Retry cadence while the profile row hasn't loaded yet at flush time. */
const SAVE_RETRY_MS = 1000;
/** Give up after ~20s of waiting; the next edit reschedules the save. */
const SAVE_MAX_RETRIES = 20;

interface ThemeContextValue {
  theme: ThemeConfig;
  /** Patch fields; touching an identity field flips `preset` to "custom". */
  updateTheme: (patch: Partial<ThemeConfig>) => void;
  /** Replace the whole config with a registered preset's. */
  setPreset: (key: string) => void;
  resetToDefault: () => void;
  /** Re-apply after the wallpaper blob changed under the same config. */
  refreshWallpaper: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: DEFAULT_THEME,
  updateTheme: () => {},
  setPreset: () => {},
  resetToDefault: () => {},
  refreshWallpaper: () => {},
});

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * One render-null probe per extension. Extensions are a build-static list, so
 * the set of mounted probes (and thus hook order) never changes at runtime.
 * The hook itself is called unconditionally every render; `active` tells the
 * extension whether night-sync is on so it can gate its own data fetching.
 */
function ExtensionProbe({
  ext,
  active,
  onOverride,
}: {
  ext: ThemeExtensionDef;
  active: boolean;
  onOverride: (key: string, value: string | null) => void;
}) {
  const useAccentOverride = ext.useAccentOverride;
  const value = useAccentOverride(active);
  useEffect(() => {
    onOverride(ext.key, value !== null && HEX_RE.test(value) ? value : null);
  }, [ext.key, value, onOverride]);
  return null;
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Which ambient effect (if any) the config asks for. */
function resolveAmbientKey(theme: ThemeConfig): string | null {
  if (theme.ambientMode === "off") return null;
  if (theme.ambientMode === "on") return theme.ambientEffect;
  // "auto": follow the active preset's own effect.
  return getPreset(theme.preset)?.config.ambientEffect ?? null;
}

function AmbientLayer({ theme }: { theme: ThemeConfig }) {
  const reducedMotion = usePrefersReducedMotion();
  const effectKey = reducedMotion ? null : resolveAmbientKey(theme);
  const [effect, setEffect] = useState<AmbientEffectDef | null>(null);

  useEffect(() => {
    if (!effectKey) {
      setEffect(null);
      return;
    }
    let cancelled = false;
    void loadAmbientEffects().then((defs) => {
      if (!cancelled) setEffect(defs.find((d) => d.key === effectKey) ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [effectKey]);

  if (!effect) return null;
  const Effect = effect.Component;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
      <Effect />
    </div>
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user } = useCurrentUser();
  const userId = user?.id ?? null;

  const [theme, setThemeState] = useState<ThemeConfig>(() => loadStoredTheme() ?? DEFAULT_THEME);
  const [wallpaperVersion, setWallpaperVersion] = useState(0);
  const [overrides, setOverrides] = useState<Record<string, string | null>>({});

  const themeRef = useRef(theme);
  themeRef.current = theme;
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  /** A local edit exists that the server hasn't confirmed yet. */
  const dirtyRef = useRef(false);
  /** Serialized server theme last accepted, to reconcile only real changes. */
  const reconciledRef = useRef<string | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const saveRetriesRef = useRef(0);

  // ── Server reconciliation (server wins unless a local edit is pending) ──
  const profileQuery = useQuery({
    queryKey: qk.profile(userId),
    queryFn: ({ signal }) => fetchProfile(userId as string, signal),
    enabled: userId !== null,
  });
  const profileData = profileQuery.data;

  // Whether the profile row was fetched FRESH in this session. Mere presence in
  // the query cache is not enough: `PersistQueryClientProvider` rehydrates it
  // from localStorage (maxAge 24h), so a snapshot is available on the very
  // first frame. The save below full-replaces the profile, so writing from a
  // rehydrated-but-unrefetched row would silently revert whatever the user
  // changed on another device since that snapshot was taken.
  const profileFreshRef = useRef(false);
  profileFreshRef.current = profileQuery.isSuccess && profileQuery.isFetchedAfterMount;

  useEffect(() => {
    if (!profileData || dirtyRef.current) return;
    const serverTheme = profileData.profile.theme ?? null;
    const serverJson = JSON.stringify(serverTheme);
    if (reconciledRef.current === serverJson) return;
    reconciledRef.current = serverJson;
    const next = serverTheme ? { ...DEFAULT_THEME, ...serverTheme } : DEFAULT_THEME;
    if (JSON.stringify(next) === JSON.stringify(themeRef.current)) return;
    setThemeState(next);
    saveStoredTheme(next);
  }, [profileData]);

  // ── Debounced save (mirror already written synchronously by the setters) ─
  const flush = useCallback(async () => {
    saveTimerRef.current = null;
    const uid = userIdRef.current;
    if (!uid) {
      // Not signed in: the mirror is all there is.
      dirtyRef.current = false;
      return;
    }
    const cached = queryClient.getQueryData<PublicProfile>(qk.profile(uid));
    if (!profileFreshRef.current || !cached) {
      // The row hasn't been re-fetched this session yet, so a full-replace
      // would write stale sibling fields. Hold the save and retry — but only
      // for a bounded window: if the profile fetch is simply failing, keep the
      // dirty flag (the next edit reschedules) rather than spinning forever.
      if (saveRetriesRef.current >= SAVE_MAX_RETRIES) {
        saveRetriesRef.current = 0;
        return;
      }
      saveRetriesRef.current += 1;
      saveTimerRef.current = window.setTimeout(() => void flush(), SAVE_RETRY_MS);
      return;
    }
    saveRetriesRef.current = 0;
    const config = themeRef.current;
    const themePayload = isDefaultTheme(config) ? null : config;
    try {
      const saved = await updateMyProfile(uid, { ...cached.profile, theme: themePayload });
      dirtyRef.current = false;
      reconciledRef.current = JSON.stringify(saved.theme ?? null);
      queryClient.setQueryData<PublicProfile>(qk.profile(uid), (old) =>
        old ? { ...old, profile: saved } : old,
      );
    } catch {
      // Keep the dirty flag: the next edit (or reload reconcile) retries.
      // The mirror already holds the look, so nothing is lost visually.
    }
  }, [queryClient]);

  const scheduleSave = useCallback(() => {
    dirtyRef.current = true;
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => void flush(), SAVE_DEBOUNCE_MS);
  }, [flush]);

  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current);
    },
    [],
  );

  // ── Setters ──────────────────────────────────────────────────────────
  const updateTheme = useCallback(
    (patch: Partial<ThemeConfig>) => {
      setThemeState((prev) => {
        const touchesIdentity = THEME_IDENTITY_KEYS.some((k) => k in patch && patch[k] !== prev[k]);
        const next: ThemeConfig = {
          ...prev,
          ...patch,
          preset: patch.preset ?? (touchesIdentity ? "custom" : prev.preset),
        };
        saveStoredTheme(next);
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const setPreset = useCallback(
    (key: string) => {
      const preset = getPreset(key);
      if (!preset) return;
      setThemeState((prev) => {
        // Apply only the LOOK (the identity keys), not the whole config: the
        // comfort knobs (base text size, ambient mode, accent mode) are
        // deliberately outside `THEME_IDENTITY_KEYS` precisely because a
        // preset badge should survive them — so a preset must not reset them
        // either. Someone reading at 20px stays at 20px after picking
        // Midnight. `ambientEffect` rides along too: under the default
        // `ambientMode: "auto"` the preset's own effect is resolved from the
        // registry anyway, so overwriting the stored pick would only discard
        // a manual choice.
        const next: ThemeConfig = { ...prev, preset: preset.key };
        for (const k of THEME_IDENTITY_KEYS) {
          Object.assign(next, { [k]: preset.config[k] });
        }
        saveStoredTheme(next);
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const resetToDefault = useCallback(() => {
    setThemeState(DEFAULT_THEME);
    saveStoredTheme(DEFAULT_THEME);
    scheduleSave();
  }, [scheduleSave]);

  const refreshWallpaper = useCallback(() => setWallpaperVersion((v) => v + 1), []);

  // ── Night-sync accent override (first non-null wins, glob order) ──────
  const extensions = listExtensions();
  const onOverride = useCallback((key: string, value: string | null) => {
    setOverrides((prev) => (prev[key] === value ? prev : { ...prev, [key]: value }));
  }, []);
  const nightAccent = useMemo(() => {
    for (const ext of extensions) {
      const value = overrides[ext.key];
      if (value) return value;
    }
    return null;
  }, [extensions, overrides]);

  // ── Webfont gating ────────────────────────────────────────────────────
  // A font whose module carries a `load()` must finish loading (including
  // `document.fonts.ready`) before its stack flips `--font-body`, so a
  // mid-session font SWITCH never renders a beat of raw fallback; a rejected
  // load keeps the current face. The built-in ("inter"), load-less fonts and
  // the session's INITIAL font are trusted immediately — the anti-flash
  // script already painted the initial stack pre-paint, and downgrading it
  // while load() runs would itself be a flash. load() is still kicked for
  // the active font every time so the @font-face actually registers.
  const [loadedFonts, setLoadedFonts] = useState<Record<string, true>>(() => ({
    [INTER_FONT.key]: true,
    [getFont(theme.fontFamily).key]: true,
  }));
  const activeFontKey = getFont(theme.fontFamily).key;
  useEffect(() => {
    const font = getFont(activeFontKey);
    const markLoaded = () =>
      setLoadedFonts((prev) => (prev[font.key] ? prev : { ...prev, [font.key]: true }));
    if (!font.load) {
      markLoaded();
      return;
    }
    let cancelled = false;
    font
      .load()
      .then(() => document.fonts?.ready ?? Promise.resolve())
      .then(() => {
        if (!cancelled) markLoaded();
      })
      .catch(() => {
        // load failed — never mark ready; the current font stays applied
      });
    return () => {
      cancelled = true;
    };
  }, [activeFontKey]);

  const effectiveTheme = useMemo(() => {
    let next = theme;
    if (theme.accentMode === "night-sync" && nightAccent && nightAccent !== theme.accent) {
      next = { ...next, accent: nightAccent };
    }
    if (!loadedFonts[getFont(next.fontFamily).key]) {
      next = { ...next, fontFamily: INTER_FONT.key };
    }
    return next;
  }, [theme, nightAccent, loadedFonts]);

  // ── Apply to :root (idempotent; the anti-flash script painted frame 1) ─
  useEffect(() => {
    // `wallpaperVersion` re-runs the apply when the wallpaper blob changed
    // under an unchanged config (applyTheme reads it from localStorage).
    void wallpaperVersion;
    applyTheme(effectiveTheme);
  }, [effectiveTheme, wallpaperVersion]);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, updateTheme, setPreset, resetToDefault, refreshWallpaper }),
    [theme, updateTheme, setPreset, resetToDefault, refreshWallpaper],
  );

  return (
    <ThemeContext.Provider value={value}>
      {extensions.map((ext) => (
        <ExtensionProbe
          key={ext.key}
          ext={ext}
          active={theme.accentMode === "night-sync"}
          onOverride={onOverride}
        />
      ))}
      <AmbientLayer theme={effectiveTheme} />
      {children}
    </ThemeContext.Provider>
  );
}
