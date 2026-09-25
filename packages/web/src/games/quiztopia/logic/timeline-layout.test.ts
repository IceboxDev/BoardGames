import type { TimelineIndex } from "@boardgames/core/games/quiztopia/content-types";
import type { TimelineEvent } from "@boardgames/core/games/quiztopia/timeline";
import { describe, expect, it } from "vitest";
import {
  joinPins,
  layoutTimeline,
  spreadApart,
  type TimelineItem,
  toTimelineItem,
} from "./timeline-layout";

const NOW = { year: 2026, month: 9, day: 24 };

function event(start: string, extra: Partial<TimelineEvent> = {}): TimelineEvent {
  return {
    kind: "event",
    start,
    end: null,
    precision: start.replace(/^-/, "").includes("-") ? "day" : "year",
    approx: false,
    ongoing: false,
    labelEn: `Event ${start}`,
    labelDe: `Ereignis ${start}`,
    ...extra,
  };
}

function item(qid: string, start: string, extra: Partial<TimelineEvent> = {}): TimelineItem {
  const it = toTimelineItem(qid, event(start, extra), { known: true, lastReviewedAt: null }, NOW);
  if (!it) throw new Error(qid);
  return it;
}

describe("joinPins", () => {
  it("keeps pins with an event, oldest first, and counts the undated", () => {
    const index: TimelineIndex = {
      "c001-s01-q1": { n: 1, k: "creation", s: "1841-08-26", p: "day", en: "Lied", de: "Lied" },
      "c002-s06-q0": {
        n: 6,
        k: "lifespan",
        s: "-100",
        e: "-44",
        p: "year",
        en: "Caesar",
        de: "Caesar",
      },
      "c003-s10-q2": { n: 10, k: "era", s: "-66000000", p: "megayear", a: 1, en: "K", de: "K" },
    };
    const pins = [
      { questionId: "c001-s01-q1", state: "review" as const, known: true, lastReviewedAt: null },
      { questionId: "c002-s06-q0", state: "learning" as const, known: false, lastReviewedAt: null },
      { questionId: "c003-s10-q2", state: "review" as const, known: true, lastReviewedAt: null },
      { questionId: "c004-s02-q0", state: "review" as const, known: true, lastReviewedAt: null },
    ];
    const { items, undated } = joinPins(pins, index, NOW);
    expect(undated).toBe(1);
    expect(items.map((i) => i.questionId)).toEqual(["c003-s10-q2", "c002-s06-q0", "c001-s01-q1"]);
    const caesar = items[1];
    expect(caesar).toMatchObject({ n: 6, q: 0, cardId: "c002", setId: "c002-s06", known: false });
    expect(caesar.interval).toBe(true);
    expect(caesar.era).toBe("antiquity");
    expect(items[0].event.approx).toBe(true);
    expect(items[0].era).toBe("deep-time");
  });
});

describe("layoutTimeline", () => {
  const items = [
    item("c001-s01-q0", "-13800000000", { precision: "megayear" }),
    item("c001-s01-q1", "-44-03-15"),
    item("c001-s01-q2", "1841-08-26"),
    item("c001-s01-q3", "1841-08-27"),
    item("c001-s01-q4", "1841-08-28"),
    item("c002-s01-q0", "1898-07-06", { kind: "lifespan", end: "1962-09-06" }),
    item("c002-s01-q1", "1950"),
    item("c002-s01-q2", "1954", { kind: "lifespan", ongoing: true }),
  ];

  it("keeps dots in time order, spaced, and cards on a side from overlapping", () => {
    const layout = layoutTimeline(items, { columns: 2, cardHeight: 60, gap: 8, minStep: 20 });
    const ys = layout.items.map((l) => l.y);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(20);
    for (const side of ["left", "right"] as const) {
      const mine = layout.items.filter((l) => l.side === side).map((l) => l.cardY);
      for (let i = 1; i < mine.length; i++)
        expect(mine[i] - mine[i - 1]).toBeGreaterThanOrEqual(68);
    }
    // Both sides get used.
    expect(new Set(layout.items.map((l) => l.side)).size).toBe(2);
    expect(layout.height).toBeGreaterThan(ys[ys.length - 1]);
  });

  it("stacks every card in one column on phones", () => {
    const layout = layoutTimeline(items, { columns: 1, cardHeight: 60, gap: 8 });
    expect(layout.items.every((l) => l.side === "right")).toBe(true);
    const ys = layout.items.map((l) => l.cardY);
    for (let i = 1; i < ys.length; i++) expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(68);
  });

  it("gives every era a header row in order, counting its pins", () => {
    const layout = layoutTimeline(items);
    expect(layout.eras.map((e) => e.era.id)).toEqual([
      "deep-time",
      "antiquity",
      "middle-ages",
      "early-modern",
      "c19",
      "c20",
      "c21",
    ]);
    for (let i = 1; i < layout.eras.length; i++) {
      expect(layout.eras[i].y).toBeGreaterThan(layout.eras[i - 1].y);
      expect(layout.eras[i - 1].bottom).toBe(layout.eras[i].y);
    }
    expect(layout.eras.map((e) => e.count)).toEqual([1, 1, 0, 0, 4, 2, 0]);
    // Each item sits inside its era's band, below the header.
    for (const l of layout.items) {
      const band = layout.eras.find((e) => e.era.id === l.item.era);
      expect(l.y).toBeGreaterThanOrEqual((band?.y ?? 0) + 44);
      expect(l.y).toBeLessThan(band?.bottom ?? 0);
    }
  });

  it("draws intervals as bars ending where their end date sits, in separate lanes when they overlap", () => {
    const layout = layoutTimeline(items);
    expect(layout.spans).toHaveLength(2);
    const [eisler, living] = layout.spans;
    expect(eisler.y1).toBeGreaterThan(eisler.y0);
    const y1950 = layout.items.find((l) => l.item.questionId === "c002-s01-q1")?.y ?? 0;
    // Eisler died in 1962 — after the 1950 pin.
    expect(eisler.y1).toBeGreaterThan(y1950);
    expect(living.lane).not.toBe(eisler.lane);
    expect(living.y1).toBeLessThanOrEqual(layout.height);
    expect(layout.lanes).toBe(2);
    // The key → y map is monotonic.
    const keys = [-1e9, -5000, -44, 500, 1600, 1850, 1900, 1990, 2020];
    const ys = keys.map(layout.yOf);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1]);
  });

  it("places dots in an era by their dates, and cards as near their dots as they fit", () => {
    const layout = layoutTimeline([
      item("c001-s01-q0", "1876-03-07"),
      item("c001-s01-q1", "1876-03-10"),
      item("c001-s01-q2", "1880"),
      item("c001-s01-q3", "1890"),
      item("c001-s01-q4", "1899"),
    ]);
    const y = (qid: string) => layout.items.find((l) => l.item.questionId === qid)?.y ?? 0;
    // Three days apart: only the minimum step; ten and nine years: far more.
    expect(y("c001-s01-q1") - y("c001-s01-q0")).toBe(12);
    const decade = y("c001-s01-q3") - y("c001-s01-q2");
    expect(decade).toBeGreaterThan(40);
    expect((y("c001-s01-q4") - y("c001-s01-q3")) / decade).toBeCloseTo(0.9, 1);
    // A card whose neighbours leave room sits level with its dot.
    const last = layout.items[layout.items.length - 1];
    expect(last.cardY).toBe(last.y);
    for (const l of layout.items) {
      const band = layout.eras.find((e) => e.era.id === l.item.era);
      expect(l.cardY).toBeGreaterThanOrEqual((band?.y ?? 0) + 44);
      expect(l.cardY + 68).toBeLessThanOrEqual(band?.bottom ?? 0);
    }
  });

  it("spreads positions apart with the least movement", () => {
    expect(spreadApart([0, 0, 0], 10, -100, 100)).toEqual([-10, 0, 10]);
    expect(spreadApart([0, 50, 51], 10, 0, 100)).toEqual([0, 45.5, 55.5]);
    expect(spreadApart([95, 99], 10, 0, 100)).toEqual([90, 100]);
  });

  it("lays out an empty timeline as seven compact bands", () => {
    const layout = layoutTimeline([]);
    expect(layout.items).toEqual([]);
    expect(layout.eras).toHaveLength(7);
    expect(layout.height).toBeGreaterThan(0);
  });

  it("collapses eras without pins so a sparse timeline stays short", () => {
    const layout = layoutTimeline([item("c001-s01-q0", "1950"), item("c001-s01-q1", "1955")]);
    const tall = layout.eras.find((e) => e.count > 0);
    const empty = layout.eras.filter((e) => e.count === 0);
    expect(tall).toBeDefined();
    for (const e of empty) expect(e.bottom - e.y).toBeLessThanOrEqual(120);
    // The populated era is not squeezed along with the rest.
    expect((tall?.bottom ?? 0) - (tall?.y ?? 0)).toBeGreaterThan(120);
  });
});
