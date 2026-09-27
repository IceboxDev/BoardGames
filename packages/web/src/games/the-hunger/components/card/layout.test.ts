import { describe, expect, it } from "vitest";
import { artBox, CARD_H, FIGURE_FADE_FROM, TEXT_ZONE } from "./layout";

describe("card layout", () => {
  it("keeps every piece of art off the card's edges", () => {
    for (const face of ["compact", "showcase"] as const) {
      for (const shape of ["figure", "beast", "object"] as const) {
        const b = artBox(face, shape);
        expect(b.x).toBeGreaterThanOrEqual(5);
        expect(b.x + b.w).toBeLessThanOrEqual(95);
        expect(b.y).toBeGreaterThan(0);
      }
    }
  });

  it("puts the compact text zone where a figure has already faded", () => {
    const zoneTop = CARD_H * (1 - TEXT_ZONE.compact);
    const figure = artBox("compact", "figure");
    // The figure is fully faded (its bottom edge) within a few units of the zone's top…
    expect(Math.abs(figure.y + figure.h - zoneTop)).toBeLessThan(4);
    // …and starts fading well above it, so the name never sits on solid art.
    expect(figure.y + figure.h * FIGURE_FADE_FROM).toBeLessThan(zoneTop);
  });

  it("centres beasts and objects above the text zone", () => {
    for (const shape of ["beast", "object"] as const) {
      const b = artBox("compact", shape);
      expect(b.y + b.h).toBeLessThanOrEqual(CARD_H * (1 - TEXT_ZONE.compact) + 1);
    }
  });
});
