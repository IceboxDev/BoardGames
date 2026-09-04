import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_ACCENT, getAccent } from "./accent";

const root = document.documentElement;

afterEach(() => {
  root.style.removeProperty("--color-accent-500");
});

describe("accent", () => {
  it("DEFAULT_ACCENT stays the stock indigo the app has always used", () => {
    expect(DEFAULT_ACCENT).toBe("#6366f1");
  });

  it("getAccent falls back to DEFAULT_ACCENT when no var is set (jsdom)", () => {
    expect(getAccent()).toBe(DEFAULT_ACCENT);
  });

  it("getAccent reads a live --color-accent-500 override, uncached", () => {
    root.style.setProperty("--color-accent-500", "#ff2d95");
    expect(getAccent()).toBe("#ff2d95");
    root.style.removeProperty("--color-accent-500");
    expect(getAccent()).toBe(DEFAULT_ACCENT);
  });
});
