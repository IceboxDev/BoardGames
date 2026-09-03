import { describe, expect, it } from "vitest";
import { planDescription } from "./carousel-description";

// Deterministic variant lengths, far apart so estimate wobble can't flip
// the expected pick.
const descriptions = {
  tight: "t".repeat(150),
  default: "d".repeat(300),
  loose: "l".repeat(500),
};
const title = "Dune: Imperium – Uprising"; // 25 chars

describe("planDescription", () => {
  it("picks the loose variant with scaled-up type on a MAX-width card", () => {
    // 640×943 tower card → 488px body: the slot fits far more than 500 chars.
    const plan = planDescription({
      cardW: 640,
      bodyHeight: 488,
      compact: false,
      title,
      descriptions,
    });
    expect(plan.text).toBe(descriptions.loose);
    expect(plan.fontPx).toBe(17); // 12 × softened scale, capped at 1.4
    expect(plan.titleFontPx).toBe(28); // 20 × 1.4 — hierarchy preserved
    expect(plan.maxLines).toBeGreaterThanOrEqual(8);
  });

  it("keeps the reference card at the tuned sizes", () => {
    const plan = planDescription({
      cardW: 380,
      bodyHeight: 290,
      compact: false,
      title,
      descriptions,
    });
    expect(plan.fontPx).toBe(12);
    expect(plan.titleFontPx).toBe(20);
    expect(plan.text).not.toBeNull();
  });

  it("fits a compact title on one line by shrinking its font", () => {
    // 300px card, 25-char title: (300-24)/(0.55·25) ≈ 20 → capped at 18,
    // which fits ~28 chars in the 276px text column.
    const plan = planDescription({
      cardW: 300,
      bodyHeight: 230,
      compact: true,
      title,
      descriptions,
    });
    expect(plan.titleFontPx).toBe(18);
    // A long title shrinks toward the floor instead of wrapping.
    const long = planDescription({
      cardW: 300,
      bodyHeight: 230,
      compact: true,
      title: "Hegemony: Lead Your Class to Victory",
      descriptions,
    });
    expect(long.titleFontPx).toBeLessThan(18);
    expect(long.titleFontPx).toBeGreaterThanOrEqual(13);
  });

  it("never truncates by choice — falls back to the variant that fits whole", () => {
    // A slot where default would need an ellipsis: the complete tight wins.
    const d = { tight: "t".repeat(100), default: "d".repeat(380), loose: "l".repeat(600) };
    const plan = planDescription({
      cardW: 360,
      bodyHeight: 279,
      compact: false,
      title,
      descriptions: d,
    });
    expect(plan.text).toBe(d.tight);
  });

  it("shows no description at all when even tight can't fit whole", () => {
    const tiny = { tight: "t".repeat(400), default: "d".repeat(450), loose: "l".repeat(500) };
    const plan = planDescription({
      cardW: 280,
      bodyHeight: 210,
      compact: true,
      title,
      descriptions: tiny,
    });
    expect(plan.text).toBeNull();
  });

  it("renders nothing when the slot is under two lines", () => {
    const plan = planDescription({
      cardW: 220,
      bodyHeight: 170,
      compact: true,
      title,
      descriptions,
    });
    expect(plan.text).toBeNull();
  });

  it("never plans more lines than fit the slot", () => {
    for (const cardW of [220, 300, 380, 520, 640]) {
      for (const compact of [false, true]) {
        const bodyHeight = cardW * 1.4737 * (290 / 560);
        const plan = planDescription({ cardW, bodyHeight, compact, title, descriptions });
        // Loosest bound: the non-title fixed rows plus ONE title line.
        const fixed = (compact ? 115 : 152) + Math.round(plan.titleFontPx * 1.15);
        expect(plan.maxLines * plan.lineHeightPx).toBeLessThanOrEqual(bodyHeight - fixed);
      }
    }
  });
});
