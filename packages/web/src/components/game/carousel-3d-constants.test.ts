import { describe, expect, it } from "vitest";
import {
  carouselPose,
  NEIGHBOR_PEEK,
  narrowSpread,
  neighborHalfWidth,
  SPREAD_K,
} from "./carousel-3d-constants";

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

describe("narrowSpread", () => {
  const t1 = Math.tanh(1 / SPREAD_K);

  it("parks the offset-1 card's near edge exactly NEIGHBOR_PEEK inside the container", () => {
    // The vote-modal-on-a-phone shape: small height-bound card, narrow container.
    const containerW = 380;
    const cardW = 227;
    const x1 = narrowSpread(containerW, cardW) * t1;
    const nearEdge = x1 - neighborHalfWidth(cardW);
    expect(nearEdge).toBeCloseTo(containerW / 2 - NEIGHBOR_PEEK, 6);
  });

  it("never exposes more than the peek, for any card the container can hold", () => {
    // The invariant the carousel relies on when it takes
    // max(defaultSpread, narrowSpread): whatever the card size, at most
    // NEIGHBOR_PEEK px of the neighbor reach past the container edge fade.
    for (const containerW of [320, 380, 600]) {
      for (const cardW of [200, 260, 300, containerW * 0.92]) {
        const defaultSpread = cardW * (520 / 380);
        const spread = Math.max(defaultSpread, narrowSpread(containerW, cardW));
        const nearEdge = spread * t1 - neighborHalfWidth(cardW);
        expect(nearEdge).toBeGreaterThanOrEqual(containerW / 2 - NEIGHBOR_PEEK - 1e-6);
      }
    }
  });
});
