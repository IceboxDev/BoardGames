import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, type ThemeConfig } from "./config.ts";
import {
  loadStoredTheme,
  loadWallpaper,
  saveStoredTheme,
  saveWallpaper,
  THEME_STORAGE_KEY,
  WALLPAPER_STORAGE_KEY,
} from "./storage.ts";

const CUSTOM: ThemeConfig = { ...DEFAULT_THEME, preset: "midnight", accent: "#5b8dee" };

describe("theme localStorage mirror", () => {
  it("round-trips a non-default config", () => {
    saveStoredTheme(CUSTOM);
    expect(loadStoredTheme()).toEqual(CUSTOM);
  });

  it("clears the key for the stock look instead of storing it", () => {
    saveStoredTheme(CUSTOM);
    saveStoredTheme({ ...DEFAULT_THEME });
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(loadStoredTheme()).toBeNull();
  });

  it("fills missing keys from DEFAULT_THEME and drops unknown ones", () => {
    localStorage.setItem(
      THEME_STORAGE_KEY,
      JSON.stringify({ accent: "#10b981", futureKnob: "??" }),
    );
    const loaded = loadStoredTheme();
    expect(loaded).not.toBeNull();
    expect(loaded?.accent).toBe("#10b981");
    expect(loaded?.surface950).toBe(DEFAULT_THEME.surface950);
    expect(loaded && "futureKnob" in loaded).toBe(false);
  });

  it("reads corrupt or invalid payloads as no-mirror", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "{not json");
    expect(loadStoredTheme()).toBeNull();
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify({ patternOpacity: 7 }));
    expect(loadStoredTheme()).toBeNull();
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(["not", "an", "object"]));
    expect(loadStoredTheme()).toBeNull();
  });

  it("is quota-safe: a throwing storage neither crashes reads nor writes", () => {
    const broken = {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("quota");
      },
      removeItem() {
        throw new Error("blocked");
      },
    };
    Object.defineProperty(window, "localStorage", { value: broken, configurable: true });
    expect(loadStoredTheme()).toBeNull();
    expect(() => saveStoredTheme(CUSTOM)).not.toThrow();
    expect(() => saveStoredTheme({ ...DEFAULT_THEME })).not.toThrow();
    expect(saveWallpaper("data:image/png;base64,AAAA")).toBe(false);
    expect(loadWallpaper()).toBeNull();
  });
});

describe("wallpaper storage", () => {
  it("round-trips a data URL and clears on null", () => {
    expect(saveWallpaper("data:image/png;base64,AAAA")).toBe(true);
    expect(loadWallpaper()).toBe("data:image/png;base64,AAAA");
    expect(saveWallpaper(null)).toBe(true);
    expect(loadWallpaper()).toBeNull();
  });

  it("refuses to serve a non-image payload", () => {
    localStorage.setItem(WALLPAPER_STORAGE_KEY, "javascript:alert(1)");
    expect(loadWallpaper()).toBeNull();
  });
});
