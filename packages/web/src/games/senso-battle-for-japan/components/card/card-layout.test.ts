import { describe, expect, it } from "vitest";
import {
  BODY,
  boxStyle,
  contains,
  cq,
  DETAIL,
  FRAME,
  GLYPH_INK,
  GRID,
  INDEX_MARGIN,
  type IndexDetail,
  indexBounds,
  indexGeometry,
  MIN_FACE_PX,
  MIN_RANK_PX,
  mirror,
  NINJA_FIGURE,
  overlaps,
  PIP_LAYOUTS,
  pipRects,
  RIBBON,
  rankGlyphPx,
  SAFE,
  SEAL,
  type SensoCardSize,
} from "./card-layout";

const DETAILS: IndexDetail[] = ["normal", "large"];
const RANKS = [2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Everything a body element must keep clear of. */
function reserved(detail: IndexDetail) {
  const idx = indexBounds(detail);
  return [idx, mirror(idx), RIBBON.box, SEAL];
}

describe("pip layouts", () => {
  it.each(RANKS)("rank %i has that many pips, all inside the unit square", (rank) => {
    const pips = PIP_LAYOUTS[rank];
    expect(pips).toHaveLength(rank);
    for (const p of pips) {
      expect(p.u).toBeGreaterThanOrEqual(0);
      expect(p.u).toBeLessThanOrEqual(1);
      expect(p.v).toBeGreaterThanOrEqual(0);
      expect(p.v).toBeLessThanOrEqual(1);
      expect(p.flip).toBe(p.v > 0.5);
    }
  });

  it.each(RANKS)("rank %i is left/right symmetric, and point-symmetric except the 7", (rank) => {
    const key = (u: number, v: number) => `${u.toFixed(3)}:${v.toFixed(3)}`;
    const set = new Set(PIP_LAYOUTS[rank].map((p) => key(p.u, p.v)));
    for (const p of PIP_LAYOUTS[rank]) {
      expect(set.has(key(1 - p.u, p.v)), `left/right mirror of ${key(p.u, p.v)}`).toBe(true);
      // A real 7 carries its odd pip in the upper half only.
      if (rank !== 7) {
        expect(set.has(key(1 - p.u, 1 - p.v)), `point mirror of ${key(p.u, p.v)}`).toBe(true);
      }
    }
  });

  it("returns nothing for a rank without pips", () => {
    expect(pipRects(13, "normal")).toEqual([]);
  });
});

describe.each(DETAILS)("%s detail — geometry", (detail) => {
  it.each(RANKS)("rank %i pips stay inside SAFE, apart, and off the index/ribbon/seal", (rank) => {
    const rects = pipRects(rank, detail);
    expect(rects).toHaveLength(rank);
    for (const [i, r] of rects.entries()) {
      expect(contains(SAFE, r), `pip ${i} inside safe`).toBe(true);
      for (const zone of reserved(detail)) {
        expect(overlaps(r, zone), `pip ${i} vs reserved ${JSON.stringify(zone)}`).toBe(false);
      }
      for (const [j, o] of rects.entries()) {
        if (j !== i) expect(overlaps(r, o), `pip ${i} vs pip ${j}`).toBe(false);
      }
    }
  });

  it("the index footprint is inside SAFE and clear of the ribbon and seal", () => {
    const idx = indexBounds(detail);
    expect(contains(SAFE, idx)).toBe(true);
    expect(overlaps(idx, RIBBON.box)).toBe(false);
    expect(overlaps(idx, SEAL)).toBe(false);
    expect(overlaps(mirror(idx), RIBBON.box)).toBe(false);
    expect(overlaps(mirror(idx), SEAL)).toBe(false);
    expect(overlaps(idx, mirror(idx))).toBe(false);
  });

  it("every rank's ink keeps the same margin to the hairline on the left and the top", () => {
    const inner = FRAME.hairline.box.x + FRAME.hairline.width;
    for (const glyph of Object.keys(GLYPH_INK)) {
      const g = indexGeometry(glyph, detail);
      expect(g.ink.x - inner, `${glyph} left`).toBeCloseTo(INDEX_MARGIN, 5);
      expect(g.ink.y - inner, `${glyph} top`).toBeCloseTo(INDEX_MARGIN, 5);
      // The line box starts left of the ink by the glyph's side bearing only.
      expect(g.glyph.x).toBeLessThanOrEqual(g.ink.x);
      expect(g.ink.x - g.glyph.x).toBeLessThan(6);
    }
    for (const box of [BODY[detail].court, BODY[detail].pipArea, RIBBON.box]) {
      expect(box.x).toBeGreaterThan(indexBounds(detail).x);
    }
  });

  it("the crest and the advantage bar are centred under the glyph's ink", () => {
    for (const glyph of Object.keys(GLYPH_INK)) {
      const g = indexGeometry(glyph, detail);
      const inkCentre = g.ink.x + g.ink.w / 2;
      expect(g.crest.x + g.crest.w / 2, `${glyph} crest`).toBeCloseTo(inkCentre, 5);
      expect(g.bar.x + g.bar.w / 2, `${glyph} bar`).toBeCloseTo(inkCentre, 5);
      // A Ninja is never the advantage suit, so only rank glyphs must clear the bar.
      if (glyph !== "忍") expect(g.bar.y, `${glyph} bar`).toBeGreaterThan(g.ink.y + g.ink.h);
      expect(g.crest.y, `${glyph} crest`).toBeGreaterThan(g.ink.y + g.ink.h);
      expect(g.crest.y).toBeGreaterThan(g.bar.y + g.bar.h);
    }
    // "10" is the widest; a narrow 7 must not push its crest into the hairline.
    const inner = FRAME.hairline.box.x + FRAME.hairline.width;
    expect(indexGeometry("7", detail).crest.x).toBeGreaterThan(inner + 4);
  });

  it("bodies are centred on the card", () => {
    for (const box of [BODY[detail].court, BODY[detail].pipArea, BODY[detail].aceCrest]) {
      expect(Math.abs(box.x + box.w / 2 - GRID.w / 2)).toBeLessThanOrEqual(2);
    }
  });

  it("court, ace crest and clan crest bodies are inside SAFE and clear of the reserved zones", () => {
    const body = BODY[detail];
    for (const [name, box] of Object.entries({
      court: body.court,
      aceCrest: body.aceCrest,
      crest: body.crest,
    })) {
      expect(contains(SAFE, box), `${name} inside safe`).toBe(true);
      for (const zone of reserved(detail)) {
        expect(overlaps(box, zone), `${name} vs ${JSON.stringify(zone)}`).toBe(false);
      }
    }
    // Backdrops may run under the indices but never leave the card; the bare
    // crest is only drawn when there is no ribbon.
    expect(contains(SAFE, body.aceHalo)).toBe(true);
    expect(contains(SAFE, body.crestBare)).toBe(true);
  });
});

describe("grid helpers", () => {
  it("mirror is an involution and lands at the opposite corner", () => {
    const b = { x: 16, y: 16, w: 100, h: 72 };
    expect(mirror(mirror(b))).toEqual(b);
    expect(mirror(b)).toEqual({ x: GRID.w - 116, y: GRID.h - 88, w: 100, h: 72 });
  });

  it("boxStyle and cq speak percent and container units", () => {
    expect(boxStyle({ x: 100, y: 150, w: 200, h: 300 })).toEqual({
      left: "25%",
      top: "25%",
      width: "50%",
      height: "50%",
    });
    expect(cq(64)).toBe("16cqw");
  });

  it("the ninja figure and ribbon stay on the card", () => {
    expect(contains(SAFE, NINJA_FIGURE)).toBe(true);
    expect(contains({ x: 0, y: 0, ...GRID }, RIBBON.box)).toBe(true);
    expect(contains(RIBBON.box, RIBBON.kanji)).toBe(true);
  });
});

describe("legibility", () => {
  const sizes: SensoCardSize[] = ["hand", "play", "table"];
  it.each(sizes)("%s keeps the rank glyph ≥ 11 px at its narrowest", (size) => {
    expect(rankGlyphPx(size, MIN_FACE_PX[size])).toBeGreaterThanOrEqual(MIN_RANK_PX);
  });

  it("mini drops to a single crest and one index", () => {
    expect(DETAIL.mini.body).toBe("crest");
    expect(DETAIL.mini.mirroredIndex).toBe(false);
    expect(DETAIL.mini.ribbon).toBe(false);
  });
});
