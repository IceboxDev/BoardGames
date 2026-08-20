import { describe, expect, it } from "vitest";
import { type DisplayOrderKey, nightAwareDisplayOrder } from "./display-order.ts";

const identity = (k: DisplayOrderKey) => k;

describe("nightAwareDisplayOrder", () => {
  it("orders a curated night by sortOrder, not played_at (the Storyteller-night bug)", () => {
    // The real production shape: a live-ported match carries its true
    // timestamp (18:03) while two backfilled ones share the night's 16:00
    // default. played_at DESC + id DESC put the ported match FIRST and
    // inverted the backfills; the curated order is 91 → 90 → 89.
    const night = [
      { dateKey: "2026-08-20", playedAt: "2026-08-20T18:03:53.375Z", sortOrder: 0, id: 89 },
      { dateKey: "2026-08-20", playedAt: "2026-08-20T16:00:00.000Z", sortOrder: -1, id: 90 },
      { dateKey: "2026-08-20", playedAt: "2026-08-20T16:00:00.000Z", sortOrder: -2, id: 91 },
    ];
    expect(nightAwareDisplayOrder(night, identity).map((m) => m.id)).toEqual([91, 90, 89]);
  });

  it("orders groups by their newest playedAt, newest first", () => {
    const matches = [
      { dateKey: "2026-08-04", playedAt: "2026-08-04T16:00:00.000Z", sortOrder: 0, id: 1 },
      { dateKey: "2026-08-20", playedAt: "2026-08-20T16:00:00.000Z", sortOrder: 0, id: 2 },
      { dateKey: null, playedAt: "2026-08-12T19:30:00.000Z", sortOrder: 0, id: 3 },
    ];
    expect(nightAwareDisplayOrder(matches, identity).map((m) => m.id)).toEqual([2, 3, 1]);
  });

  it("groups standalone matches by UTC day and follows sortOrder within it", () => {
    const matches = [
      { dateKey: null, playedAt: "2026-08-12T18:00:00.000Z", sortOrder: 0, id: 1 },
      { dateKey: null, playedAt: "2026-08-12T20:00:00.000Z", sortOrder: -1, id: 2 },
      { dateKey: null, playedAt: "2026-08-13T10:00:00.000Z", sortOrder: 0, id: 3 },
    ];
    // Day 08-13 first; within 08-12 the admin-set order (-1 before 0) wins
    // over played_at.
    expect(nightAwareDisplayOrder(matches, identity).map((m) => m.id)).toEqual([3, 2, 1]);
  });

  it("breaks sortOrder ties by ascending id, like /api/history/by-night", () => {
    const night = [
      { dateKey: "2026-08-20", playedAt: "2026-08-20T16:00:00.000Z", sortOrder: 0, id: 7 },
      { dateKey: "2026-08-20", playedAt: "2026-08-20T16:00:00.000Z", sortOrder: 0, id: 5 },
    ];
    expect(nightAwareDisplayOrder(night, identity).map((m) => m.id)).toEqual([5, 7]);
  });

  it("does not mutate its input", () => {
    const matches = [
      { dateKey: "2026-08-20", playedAt: "2026-08-20T16:00:00.000Z", sortOrder: -1, id: 2 },
      { dateKey: "2026-08-20", playedAt: "2026-08-20T16:00:00.000Z", sortOrder: 0, id: 1 },
    ];
    const before = matches.map((m) => m.id);
    nightAwareDisplayOrder(matches, identity);
    expect(matches.map((m) => m.id)).toEqual(before);
  });
});
