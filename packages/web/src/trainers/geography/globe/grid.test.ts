import { describe, expect, it } from "vitest";
import { formatDeg, gridStep, majorStep } from "./grid";

describe("orientation grid", () => {
  it("gets finer as the globe zooms in", () => {
    expect(gridStep(420)).toBe(20); // whole Earth on a laptop
    expect(gridStep(420 * 4)).toBe(5);
    expect(gridStep(420 * 20)).toBe(1);
    expect(gridStep(420 * 60)).toBe(0.25);
    expect(gridStep(100)).toBe(30);
    expect(majorStep(1)).toBe(5);
    expect(majorStep(20)).toBeNull();
  });

  it("labels degrees with their hemisphere", () => {
    expect(formatDeg(30, "lon", 10)).toBe("30°E");
    expect(formatDeg(-75, "lon", 5)).toBe("75°W");
    expect(formatDeg(200, "lon", 10)).toBe("160°W");
    expect(formatDeg(180, "lon", 30)).toBe("180°");
    expect(formatDeg(0, "lat", 10)).toBe("0°");
    expect(formatDeg(-33.5, "lat", 0.5)).toBe("33.5°S");
    expect(formatDeg(48.25, "lat", 0.25)).toBe("48.25°N");
    expect(formatDeg(47, "lat", 0.5)).toBe("47°N");
  });
});
