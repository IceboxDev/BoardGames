import { describe, expect, it } from "vitest";
import type { BoardRect } from "../../../../components/board";
import {
  feltRadius,
  rectAround,
  relativeSeat,
  seatAngle,
  seatPositions,
  TABLE_LAYOUTS,
  type TableLayout,
} from "./table-geometry";

const COUNTS = [2, 3, 4, 5] as const;
const LAYOUTS = [TABLE_LAYOUTS.landscape, TABLE_LAYOUTS.portrait];

function gap(a: BoardRect, b: BoardRect): number {
  const dx = Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w));
  const dy = Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h));
  return Math.max(dx, dy);
}

function corners(r: BoardRect) {
  return [
    { x: r.x, y: r.y },
    { x: r.x + r.w, y: r.y },
    { x: r.x, y: r.y + r.h },
    { x: r.x + r.w, y: r.y + r.h },
  ];
}

function centreBlock(layout: TableLayout): BoardRect {
  return rectAround(layout.centre, layout.centreBlock);
}

describe("relativeSeat / seatAngle", () => {
  it("counts clockwise from the viewer, and from seat 0 for a spectator", () => {
    expect(relativeSeat(2, 2, 4)).toBe(0);
    expect(relativeSeat(3, 2, 4)).toBe(1);
    expect(relativeSeat(1, 2, 4)).toBe(3);
    expect(relativeSeat(0, -1, 4)).toBe(0);
    expect(relativeSeat(3, -1, 4)).toBe(3);
  });

  it("puts the anchor at the bottom and the rest evenly clockwise", () => {
    expect(seatAngle(0, 4)).toBe(90);
    expect(seatAngle(1, 4)).toBe(180);
    expect(seatAngle(2, 4)).toBe(270);
    expect(seatAngle(3, 4)).toBe(0);
    expect(seatAngle(1, 3)).toBe(210);
    expect(seatAngle(2, 3)).toBe(330);
  });
});

describe.each(LAYOUTS)("seatPositions ($orientation)", (layout) => {
  it.each(COUNTS)("%i seats: one distinct plate and slot per seat, viewer at the bottom", (n) => {
    const seats = seatPositions(layout, n);
    expect(seats).toHaveLength(n);
    expect(new Set(seats.map((s) => `${s.plate.x},${s.plate.y}`)).size).toBe(n);
    expect(new Set(seats.map((s) => `${s.slot.x},${s.slot.y}`)).size).toBe(n);
    const me = seats[0];
    expect(me?.plate.x).toBe(layout.centre.x);
    expect(me?.plate.y).toBeGreaterThan(layout.centre.y);
    expect(me?.slot.y).toBeGreaterThan(layout.centre.y);
    expect(me?.plate.y).toBeGreaterThan(me?.slot.y ?? 0);
  });

  it("4 seats go bottom, left, top, right", () => {
    const [, left, top, right] = seatPositions(layout, 4);
    expect(left?.plate.x).toBeLessThan(layout.centre.x);
    expect(Math.abs((left?.plate.y ?? 0) - layout.centre.y)).toBeLessThan(1);
    expect(top?.plate.y).toBeLessThan(layout.centre.y);
    expect(Math.abs((top?.plate.x ?? 0) - layout.centre.x)).toBeLessThan(1);
    expect(right?.plate.x).toBeGreaterThan(layout.centre.x);
  });

  it("3 seats mirror the two opponents upper-left and upper-right", () => {
    const [, a, b] = seatPositions(layout, 3);
    expect(a?.plate.y).toBeLessThan(layout.centre.y);
    expect(a?.plate.x).toBeLessThan(layout.centre.x);
    expect(b?.plate.x).toBeGreaterThan(layout.centre.x);
    expect(Math.abs((a?.plate.x ?? 0) + (b?.plate.x ?? 0) - 2 * layout.centre.x)).toBeLessThan(2);
    expect(Math.abs((a?.plate.y ?? 0) - (b?.plate.y ?? 0))).toBeLessThan(2);
  });

  it.each(COUNTS)("%i seats: everything stays on the canvas and nothing overlaps", (n) => {
    const seats = seatPositions(layout, n);
    const plates = seats.map((s) => rectAround(s.plate, layout.plate));
    const cards = seats.map((s) => rectAround(s.slot, layout.card));
    const block = centreBlock(layout);
    const margin = 10;
    for (const r of [...plates, ...cards]) {
      expect(r.x).toBeGreaterThanOrEqual(margin);
      expect(r.y).toBeGreaterThanOrEqual(margin);
      expect(r.x + r.w).toBeLessThanOrEqual(layout.canvas.w - margin);
      expect(r.y + r.h).toBeLessThanOrEqual(layout.canvas.h - margin);
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        expect(gap(plates[i], plates[j])).toBeGreaterThanOrEqual(8);
        expect(gap(cards[i], cards[j])).toBeGreaterThanOrEqual(8);
      }
      for (let j = 0; j < n; j++) expect(gap(cards[i], plates[j])).toBeGreaterThanOrEqual(8);
      expect(gap(cards[i], block)).toBeGreaterThanOrEqual(0);
    }
  });

  it.each(COUNTS)("%i seats: cards lie on the cloth, plates lie off it", (n) => {
    for (const s of seatPositions(layout, n)) {
      for (const c of corners(rectAround(s.slot, layout.card))) {
        expect(feltRadius(layout, c)).toBeLessThan(1);
      }
      for (const c of corners(rectAround(s.plate, layout.plate))) {
        expect(feltRadius(layout, c)).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

describe("frozen canvases", () => {
  it("keeps the two aspect strings", () => {
    expect(TABLE_LAYOUTS.landscape.aspect).toBe("1600 / 1000");
    expect(TABLE_LAYOUTS.portrait.aspect).toBe("1000 / 1500");
  });

  it("pins the four-seat landscape positions (guards constant drift)", () => {
    expect(seatPositions(TABLE_LAYOUTS.landscape, 4).map((s) => [s.plate, s.slot])).toEqual([
      [
        { x: 800, y: 916 },
        { x: 800, y: 740 },
      ],
      [
        { x: 149, y: 500 },
        { x: 400, y: 500 },
      ],
      [
        { x: 800, y: 84 },
        { x: 800, y: 260 },
      ],
      [
        { x: 1451, y: 500 },
        { x: 1200, y: 500 },
      ],
    ]);
  });
});
