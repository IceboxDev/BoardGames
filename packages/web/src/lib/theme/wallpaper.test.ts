import { describe, expect, it, vi } from "vitest";
import { clearWallpaper, readWallpaper, storeWallpaper } from "./wallpaper";

const KEY = "bg-theme-wallpaper-v1";
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAA=";

describe("wallpaper storage", () => {
  it("stores and reads back an image data URL under the contract key", () => {
    expect(readWallpaper()).toBeNull();
    expect(storeWallpaper(TINY_PNG)).toEqual({ ok: true });
    expect(readWallpaper()).toBe(TINY_PNG);
    expect(window.localStorage.getItem(KEY)).toBe(TINY_PNG);
  });

  it("rejects non-image data URLs", () => {
    for (const bad of [
      "data:text/plain;base64,aGVsbG8=",
      "data:application/pdf;base64,JVBERg==",
      "https://example.com/cat.png",
      "",
    ]) {
      const result = storeWallpaper(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toMatch(/image/i);
    }
    expect(readWallpaper()).toBeNull();
  });

  it("rejects payloads over 2MiB after base64 encoding", () => {
    const oversized = `data:image/png;base64,${"A".repeat(2 * 1024 * 1024)}`;
    const result = storeWallpaper(oversized);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/large/i);
    expect(readWallpaper()).toBeNull();

    // Just under the limit is accepted.
    const fitting = `data:image/png;base64,${"A".repeat(2 * 1024 * 1024 - 32)}`;
    expect(storeWallpaper(fitting)).toEqual({ ok: true });
  });

  it("ignores a non-image value planted under the key", () => {
    window.localStorage.setItem(KEY, "https://example.com/not-a-wallpaper.png");
    expect(readWallpaper()).toBeNull();
  });

  it("clears the stored wallpaper", () => {
    storeWallpaper(TINY_PNG);
    clearWallpaper();
    expect(readWallpaper()).toBeNull();
    expect(window.localStorage.getItem(KEY)).toBeNull();
  });

  it("survives storage quota errors without throwing", () => {
    const setItem = vi.spyOn(window.localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("quota exceeded", "QuotaExceededError");
    });
    try {
      const result = storeWallpaper(TINY_PNG);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason.length).toBeGreaterThan(0);
    } finally {
      setItem.mockRestore();
    }
  });

  it("survives unavailable storage on read and clear", () => {
    const getItem = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    const removeItem = vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
      throw new DOMException("denied", "SecurityError");
    });
    try {
      expect(readWallpaper()).toBeNull();
      expect(() => clearWallpaper()).not.toThrow();
    } finally {
      getItem.mockRestore();
      removeItem.mockRestore();
    }
  });
});
