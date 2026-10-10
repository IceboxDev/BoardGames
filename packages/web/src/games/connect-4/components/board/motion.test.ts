import { describe, expect, it } from "vitest";
import { discMotion, fallSeconds, fallTransition, REBOUND } from "./motion";

describe("disc motion", () => {
  it("falls longer from higher, as gravity does (√ of the distance)", () => {
    expect(fallSeconds(4)).toBeCloseTo(2 * fallSeconds(1));
    expect(fallSeconds(0)).toBe(0);
  });

  it("lands on the slot before rebounding — upwards only", () => {
    const t = fallTransition(6) as { y: { times: number[]; ease: string[] } };
    expect(t.y.times).toHaveLength(4);
    expect(t.y.times[0]).toBe(0);
    expect(t.y.times[3]).toBe(1);
    expect(t.y.ease[0]).toBe("easeIn");
    expect(REBOUND).toBeGreaterThan(0); // the keyframe is slot − REBOUND: above the slot
  });

  it("doesn't move a disc that isn't falling", () => {
    expect(fallTransition(0)).toEqual({ duration: 0 });
  });

  it("revives a disc fully: whatever the exit changes, the animation sets back", () => {
    const place = { x: 50, y: 300, startY: 50, outY: 900, fallCells: 0, rows: 6 };
    for (const mode of ["live", "analysis"] as const) {
      for (const reduced of [false, true]) {
        const m = discMotion(place, mode, reduced);
        const changed = Object.keys(m.exit).filter((k) => k !== "transition");
        expect(changed.length).toBeGreaterThan(0);
        for (const key of changed) expect(Object.keys(m.animate)).toContain(key);
        expect(m.animate.opacity).toBe(1);
      }
    }
  });

  it("fades out on the analysis board, falls out in live play", () => {
    const place = { x: 50, y: 300, startY: 50, outY: 900, fallCells: 0, rows: 6 };
    expect(discMotion(place, "analysis", false).exit).not.toHaveProperty("y");
    expect(discMotion(place, "live", false).exit).toMatchObject({ y: 900, opacity: 0 });
  });
});
