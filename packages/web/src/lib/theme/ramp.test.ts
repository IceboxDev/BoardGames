import { describe, expect, it } from "vitest";
import { deriveAccentRamp, hexToRgb } from "./ramp.ts";

const HEX_RE = /^#[0-9a-f]{6}$/;

/** Perceived lightness proxy: plain RGB average is enough for monotonicity. */
function lightness(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  return r + g + b;
}

describe("deriveAccentRamp", () => {
  it("reproduces today's exact indigo ramp from the stock accent", () => {
    // Load-bearing: Classic must be byte-identical to the pre-theming app,
    // and these are the five values in index.css's @theme block.
    expect(deriveAccentRamp("#6366f1")).toEqual({
      "500": "#6366f1",
      "400": "#818cf8",
      "300": "#a5b4fc",
      "200": "#c7d2fe",
      "100": "#e0e7ff",
    });
  });

  it("anchors 500 on the input and lightens monotonically toward 100", () => {
    for (const accent of ["#10b981", "#e91e7a", "#5b8dee", "#c89b5e"]) {
      const ramp = deriveAccentRamp(accent);
      expect(ramp["500"]).toBe(accent);
      const steps = ["500", "400", "300", "200", "100"] as const;
      for (const step of steps) expect(ramp[step]).toMatch(HEX_RE);
      for (let i = 1; i < steps.length; i++) {
        expect(lightness(ramp[steps[i]])).toBeGreaterThan(lightness(ramp[steps[i - 1]]));
      }
    }
  });

  it("survives achromatic and extreme anchors without NaN escapes", () => {
    for (const accent of ["#000000", "#ffffff", "#808080"]) {
      const ramp = deriveAccentRamp(accent);
      for (const value of Object.values(ramp)) expect(value).toMatch(HEX_RE);
    }
  });

  it("treats malformed input as black rather than throwing", () => {
    const ramp = deriveAccentRamp("nonsense");
    expect(ramp["500"]).toBe("#000000");
  });
});
