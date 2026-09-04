import { afterEach, describe, expect, it } from "vitest";
import { perfColor } from "./perf-color";

const root = document.documentElement;

afterEach(() => {
  root.style.removeProperty("--color-fg-muted");
  window.dispatchEvent(new CustomEvent("themechange"));
});

describe("perfColor", () => {
  it("keeps the red→amber→green hsl formula for numeric performance", () => {
    expect(perfColor(0)).toBe("hsl(8deg 68% 47%)");
    expect(perfColor(0.5)).toBe("hsl(74deg 68% 47%)");
    expect(perfColor(1)).toBe("hsl(140deg 68% 47%)");
  });

  it("falls back to the stock muted grey for null (no theme set)", () => {
    expect(perfColor(null)).toBe("#6b7387");
  });

  it("themes the null grey through --color-fg-muted", () => {
    root.style.setProperty("--color-fg-muted", "#445566");
    window.dispatchEvent(new CustomEvent("themechange"));
    expect(perfColor(null)).toBe("#445566");
  });
});
