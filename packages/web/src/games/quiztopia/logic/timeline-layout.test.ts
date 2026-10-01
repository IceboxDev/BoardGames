import type { TimelineIndex } from "@boardgames/core/games/quiztopia/content-types";
import { type TimelineEvent, timelineSortKey } from "@boardgames/core/games/quiztopia/timeline";
import { describe, expect, it } from "vitest";
import {
  FOLDED_HEIGHT,
  joinPins,
  type LaidOutBlock,
  layoutTimeline,
  spreadApart,
  type TimelineItem,
  type TimelineLayout,
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
    expect(items[0].event.approx).toBe(true);
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
  const blocksOf = (layout: TimelineLayout) =>
    layout.blocks.filter((b): b is LaidOutBlock => b.kind === "block");

  function expectSane(layout: TimelineLayout, cardHeight = 68, gap = 10) {
    // Dots follow time.
    const byTime = [...layout.items].sort(
      (a, b) => a.item.parsed.startKey - b.item.parsed.startKey,
    );
    for (let i = 1; i < byTime.length; i++) {
      if (
        byTime[i].blockId === byTime[i - 1].blockId ||
        byTime[i].item.parsed.startKey > byTime[i - 1].item.parsed.startKey
      )
        expect(byTime[i].y).toBeGreaterThanOrEqual(byTime[i - 1].y);
    }
    // No two cards overlap on a side.
    for (const side of ["left", "right"] as const) {
      const ys = layout.items
        .filter((l) => l.side === side)
        .map((l) => l.cardY)
        .sort((a, b) => a - b);
      for (let i = 1; i < ys.length; i++)
        expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(cardHeight + gap - 1e-6);
    }
    // Cards sit inside their block, below its header.
    const byId = new Map(blocksOf(layout).map((b) => [b.id, b]));
    for (const l of layout.items) {
      const b = byId.get(l.blockId);
      if (!b) throw new Error(l.blockId);
      expect(l.cardY).toBeGreaterThanOrEqual(b.y + b.header);
      expect(l.cardY + cardHeight).toBeLessThanOrEqual(b.bottom + 1e-6);
    }
    // key → y is monotonic.
    const keys = [-1e10, -1e8, -5000, -44, 500, 1600, 1841.6, 1850, 1900, 1950, 1990, 2020];
    const ys = keys.map(layout.yOf);
    for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThanOrEqual(ys[i - 1]);
  }

  it("keeps sparse pins in whole blocks with quiet gaps between", () => {
    const layout = layoutTimeline(items);
    expectSane(layout);
    const top = layout.blocks.filter((b) => b.depth === 0);
    expect(top.map((b) => (b.kind === "block" ? b.id : "gap"))).toEqual([
      "age:cosmic",
      "gap",
      "mil:0bc",
      "gap",
      "mil:1000",
    ]);
    // Six pins spread over 1841–1962 fit the 2nd millennium AD as one leaf.
    const mil = blocksOf(layout).find((b) => b.id === "mil:1000");
    expect(mil?.mode).toBe("leaf");
    expect(mil?.count).toBe(6);
    expect(new Set(layout.items.map((l) => l.side)).size).toBe(2);
  });

  it("stacks every card in one column on phones", () => {
    const layout = layoutTimeline(items, { columns: 1, cardHeight: 60, gap: 8 });
    expect(layout.items.every((l) => l.side === "right")).toBe(true);
    expectSane(layout, 60, 8);
  });

  it("splits a dense swarm down to few cards per block", () => {
    const swarm: TimelineItem[] = [];
    let n = 0;
    for (let year = 1985; year <= 1999; year++) {
      for (const month of ["02", "05", "09"]) {
        const q = n++;
        swarm.push(
          item(
            `c${String(100 + Math.floor(q / 60)).padStart(3, "0")}-s${String(1 + Math.floor((q % 60) / 5)).padStart(2, "0")}-q${q % 5}`,
            `${year}-${month}-1${q % 9}`,
          ),
        );
      }
    }
    const layout = layoutTimeline(swarm);
    expectSane(layout);
    const perBlock = new Map<string, number>();
    for (const l of layout.items) perBlock.set(l.blockId, (perBlock.get(l.blockId) ?? 0) + 1);
    for (const [id, count] of perBlock) {
      if (!id.startsWith("mo:")) expect(count, id).toBeLessThanOrEqual(12);
    }
    // The swarm reached the years.
    expect(blocksOf(layout).some((b) => b.block.level === "year")).toBe(true);
  });

  it("folds a block into one summary row, and splits on request", () => {
    const folded = layoutTimeline(items, { overrides: { "mil:1000": "fold" } });
    const mil = blocksOf(folded).find((b) => b.id === "mil:1000");
    expect(mil?.mode).toBe("folded");
    expect((mil?.bottom ?? 0) - (mil?.y ?? 0)).toBe(FOLDED_HEIGHT);
    expect(mil?.strip).toHaveLength(6);
    expect(folded.items.some((l) => l.blockId === "mil:1000")).toBe(false);
    expect(folded.items).toHaveLength(2);

    const split = layoutTimeline(items, { overrides: { "mil:0bc": "split" } });
    // A single pin can't be separated from anything: the forced split walks
    // down the chain to the finest block that holds it.
    const caesar = split.items.find((l) => l.item.questionId === "c001-s01-q1");
    expect(caesar?.blockId).toBe("mo:44bc-03");
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
  });

  it("places dots in a block by their dates, and cards as near their dots as they fit", () => {
    const layout = layoutTimeline(
      [
        item("c001-s01-q0", "1876-03-07"),
        item("c001-s01-q1", "1876-03-10"),
        item("c001-s01-q2", "1880"),
        item("c001-s01-q3", "1890"),
      ],
      { capacity: 4 },
    );
    expectSane(layout);
    const y = (qid: string) => layout.items.find((l) => l.item.questionId === qid)?.y ?? 0;
    // Three days apart: only the minimum step; ten years: far more.
    expect(y("c001-s01-q1") - y("c001-s01-q0")).toBeCloseTo(12, 5);
    expect(y("c001-s01-q3") - y("c001-s01-q2")).toBeGreaterThan(12);
  });

  it("spreads positions apart with the least movement", () => {
    expect(spreadApart([0, 0, 0], 10, -100, 100)).toEqual([-10, 0, 10]);
    expect(spreadApart([0, 50, 51], 10, 0, 100)).toEqual([0, 45.5, 55.5]);
    expect(spreadApart([95, 99], 10, 0, 100)).toEqual([90, 100]);
  });

  it("puts Today in its own end cap below every card, where ongoing bars meet it", () => {
    const items = [
      item("c001-s01-q0", "2023-04-15"),
      item("c001-s01-q1", "2020", { kind: "reign", ongoing: true }),
    ];
    const now = timelineSortKey(NOW);
    const layout = layoutTimeline(items, { now });
    const last = Math.max(...layout.items.map((l) => l.cardY + 68));
    expect(layout.nowY).toBeGreaterThan(last);
    expect(layout.nowY).toBeLessThan(layout.height);
    expect(layout.spans[0].y1).toBe(layout.nowY);
    // A pin dated after today keeps the marker on the scale instead.
    const ahead = layoutTimeline([...items, item("c001-s01-q2", "2030")], { now });
    expect(ahead.nowY).toBeLessThan(ahead.height);
    expect(ahead.nowY).toBeLessThan(Math.max(...ahead.items.map((l) => l.y)));
  });

  it("lays out an empty timeline as nothing", () => {
    const layout = layoutTimeline([]);
    expect(layout.items).toEqual([]);
    expect(layout.blocks).toEqual([]);
    expect(layout.height).toBe(0);
  });
});
