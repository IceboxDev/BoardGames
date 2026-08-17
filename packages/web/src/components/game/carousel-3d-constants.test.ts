import { describe, expect, it } from "vitest";
import { carouselPose } from "./carousel-3d-constants";

describe("carouselPose", () => {
  it("centers at identity-ish pose with full opacity", () => {
    const pose = carouselPose({ offset: 0, spreadMax: 520, zMax: 380 });
    expect(pose.transform).toBe("translate3d(0px, 0px, 0px) rotateY(0deg) scale(1)");
    expect(pose.opacity).toBe(1);
  });

  it("mirrors left/right offsets symmetrically", () => {
    const left = carouselPose({ offset: -1, spreadMax: 520, zMax: 380 });
    const right = carouselPose({ offset: 1, spreadMax: 520, zMax: 380 });
    expect(left.opacity).toBe(right.opacity);
    expect(left.opacity).toBeLessThan(1);
    // Same magnitudes, opposite x/rotation signs.
    expect(left.transform.replace(/-/g, "")).toBe(right.transform.replace(/-/g, ""));
  });
});
