import { describe, expect, it } from "vitest";
import {
  addDays,
  applyReview,
  buildDailyQueue,
  categoryMastery,
  computeStreak,
  daysBetween,
  interleaveSiblings,
  isLeech,
  newState,
  type SrsGrade,
  type SrsState,
} from "./srs.ts";

const D0 = "2026-01-01";

function review(overrides: Partial<SrsState>): SrsState {
  return {
    questionId: "c001-s01-q0",
    state: "review",
    ease: 2.5,
    intervalDays: 10,
    dueDate: D0,
    reps: 5,
    lapses: 0,
    lastReviewedAt: "2025-12-22T10:00:00.000Z",
    ...overrides,
  };
}

/** Grade at the due date each time, like a diligent student. */
function ladder(start: SrsState, grades: readonly SrsGrade[]): SrsState[] {
  const out: SrsState[] = [];
  let s = start;
  for (const g of grades) {
    s = applyReview(s, g, { localDate: s.dueDate, now: `${s.dueDate}T09:00:00.000Z` });
    out.push(s);
  }
  return out;
}

describe("applyReview", () => {
  it("climbs 1, 3, 8, 20, 52, 138, 365, 365 on all-good, ease 2.5 → 2.8", () => {
    const steps = ladder(newState("q", D0), Array<SrsGrade>(8).fill("good"));
    expect(steps.map((s) => s.intervalDays)).toEqual([1, 3, 8, 20, 52, 138, 365, 365]);
    expect(steps.map((s) => s.state)).toEqual([
      "learning",
      "review",
      "review",
      "review",
      "review",
      "review",
      "review",
      "review",
    ]);
    expect(steps.at(-1)?.ease).toBe(2.8);
    expect(steps.at(-1)?.reps).toBe(8);
    expect(steps[0].dueDate).toBe("2026-01-02");
    expect(steps[1].dueDate).toBe("2026-01-05");
    expect(steps[2].dueDate).toBe("2026-01-13");
  });

  it("lapses from 52 to relearning 15 (ease 2.45), then 15, then 37", () => {
    const at52 = ladder(newState("q", D0), Array<SrsGrade>(5).fill("good")).at(-1) as SrsState;
    expect(at52.intervalDays).toBe(52);
    expect(at52.ease).toBe(2.65);

    const [lapsed, back, grown] = ladder(at52, ["again", "good", "good"]);
    expect(lapsed).toMatchObject({
      state: "relearning",
      intervalDays: 15,
      ease: 2.45,
      lapses: 1,
      dueDate: at52.dueDate,
    });
    expect(back).toMatchObject({ state: "review", intervalDays: 15, ease: 2.45, lapses: 1 });
    expect(back.dueDate).toBe(addDays(lapsed.dueDate, 15));
    expect(grown).toMatchObject({ state: "review", intervalDays: 37, ease: 2.5 });
  });

  it("floors ease at 1.3 and still grows the interval by at least one day", () => {
    const floored = applyReview(review({ ease: 1.3 }), "again", {
      localDate: D0,
      now: "2026-01-01T09:00:00.000Z",
    });
    expect(floored.ease).toBe(1.3);
    expect(floored.lapses).toBe(1);

    const crawl = applyReview(review({ ease: 1.3, intervalDays: 1 }), "good", {
      localDate: D0,
      now: "2026-01-01T09:00:00.000Z",
    });
    expect(crawl.intervalDays).toBe(2); // round(1 × 1.3) = 1 would freeze
    expect(crawl.ease).toBe(1.35);
  });

  it("counts a leech from the eighth lapse", () => {
    expect(isLeech({ lapses: 7 })).toBe(false);
    expect(isLeech({ lapses: 8 })).toBe(true);
    let s = review({ intervalDays: 40 });
    for (let i = 0; i < 8; i++) {
      s = applyReview(s, "again", { localDate: D0, now: "2026-01-01T09:00:00.000Z" });
      s = applyReview(s, "good", { localDate: D0, now: "2026-01-01T09:00:00.000Z" });
    }
    expect(s.lapses).toBe(8);
    expect(isLeech(s)).toBe(true);
  });

  it("never counts a lapse for again on new, learning or relearning", () => {
    const at = { localDate: D0, now: "2026-01-01T09:00:00.000Z" };
    const fromNew = applyReview(newState("q", D0), "again", at);
    expect(fromNew).toMatchObject({ state: "learning", intervalDays: 0, dueDate: D0, lapses: 0 });
    const fromLearning = applyReview(fromNew, "again", at);
    expect(fromLearning).toMatchObject({ state: "learning", dueDate: D0, lapses: 0, reps: 2 });
    const relearning = review({ state: "relearning", intervalDays: 15, lapses: 1 });
    const again = applyReview(relearning, "again", at);
    expect(again).toMatchObject({ state: "relearning", intervalDays: 15, lapses: 1, dueDate: D0 });
  });

  it("stamps reps and lastReviewedAt on every grade", () => {
    const s = applyReview(newState("q", D0), "good", {
      localDate: D0,
      now: "2026-01-01T21:30:00.000Z",
    });
    expect(s.reps).toBe(1);
    expect(s.lastReviewedAt).toBe("2026-01-01T21:30:00.000Z");
  });
});

describe("addDays / daysBetween", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("is not shifted by DST transitions", () => {
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-03-28", 2)).toBe("2026-03-30");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(addDays("2026-10-26", -1)).toBe("2026-10-25");
  });

  it("rejects a malformed key and measures whole days", () => {
    expect(() => addDays("26-1-1", 1)).toThrow(/bad date key/);
    expect(daysBetween("2026-01-01", "2026-01-11")).toBe(10);
    expect(daysBetween("2026-01-11", "2026-01-01")).toBe(-10);
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2);
  });
});

describe("buildDailyQueue", () => {
  const setIdOf = (id: string) => id.slice(0, 8);
  const learningNewer = review({
    questionId: "c001-s01-q0",
    state: "learning",
    intervalDays: 0,
    lastReviewedAt: "2026-01-01T10:00:00.000Z",
  });
  const relearningOlder = review({
    questionId: "c002-s02-q0",
    state: "relearning",
    intervalDays: 3,
    lastReviewedAt: "2026-01-01T09:00:00.000Z",
  });
  const reviewLessOverdue = review({ questionId: "c003-s03-q0", dueDate: "2025-12-30" });
  const reviewMostOverdue = review({ questionId: "c004-s04-q0", dueDate: "2025-12-28" });
  const leech = review({ questionId: "c005-s05-q0", dueDate: "2025-12-01", lapses: 8 });
  const due = [learningNewer, reviewLessOverdue, leech, relearningOlder, reviewMostOverdue];
  const newOrder = ["c006-s06-q0", "c001-s01-q0", "c007-s07-q0", "c008-s08-q0"];
  const base = {
    due,
    seenIds: new Set(due.map((s) => s.questionId)),
    newOrder,
    newRemaining: 2,
    limit: 50,
    includeLeeches: false,
    setIdOf,
  };

  it("orders learning (oldest first), then review (most overdue first), then new", () => {
    const ids = buildDailyQueue(base).map((it) => `${it.tier}:${it.questionId}`);
    expect(ids).toEqual([
      "learning:c002-s02-q0",
      "learning:c001-s01-q0",
      "review:c004-s04-q0",
      "review:c003-s03-q0",
      "new:c006-s06-q0",
      "new:c007-s07-q0",
    ]);
  });

  it("skips seen ids and caps new cards at newRemaining", () => {
    const fresh = buildDailyQueue({ ...base, newRemaining: 1 }).filter((it) => it.tier === "new");
    expect(fresh.map((it) => it.questionId)).toEqual(["c006-s06-q0"]);
    expect(fresh[0].state).toBeNull();
    expect(buildDailyQueue({ ...base, newRemaining: 0 }).some((it) => it.tier === "new")).toBe(
      false,
    );
    expect(buildDailyQueue({ ...base, newRemaining: -3 }).some((it) => it.tier === "new")).toBe(
      false,
    );
  });

  it("excludes leeches unless asked to include them", () => {
    expect(buildDailyQueue(base).some((it) => it.questionId === leech.questionId)).toBe(false);
    const withLeeches = buildDailyQueue({ ...base, includeLeeches: true });
    expect(withLeeches.map((it) => it.questionId)).toContain(leech.questionId);
    // The leech is the most overdue review, so it leads that tier.
    expect(withLeeches.filter((it) => it.tier === "review")[0].questionId).toBe(leech.questionId);
  });

  it("cuts at limit after interleaving", () => {
    expect(buildDailyQueue({ ...base, limit: 3 })).toHaveLength(3);
    expect(buildDailyQueue({ ...base, limit: 0 })).toHaveLength(0);
  });

  it("spreads siblings of one set apart", () => {
    const siblings = ["c001-s01-q0", "c001-s01-q1", "c001-s01-q2", "c002-s01-q0", "c002-s01-q1"];
    const order = buildDailyQueue({
      due: [],
      seenIds: new Set(),
      newOrder: siblings,
      newRemaining: 10,
      limit: 10,
      includeLeeches: false,
      setIdOf,
    }).map((it) => it.questionId);
    for (let i = 1; i < order.length; i++) {
      expect(setIdOf(order[i])).not.toBe(setIdOf(order[i - 1]));
    }
    expect(order).toHaveLength(5);
  });

  describe("set mode", () => {
    const sets = (card: string, n = 5) => Array.from({ length: n }, (_, q) => `${card}-s01-q${q}`);
    const input = (over: Partial<Parameters<typeof buildDailyQueue>[0]>) => ({
      due: [],
      seenIds: new Set<string>(),
      newOrder: [...sets("c001"), ...sets("c002"), ...sets("c003")],
      newRemaining: 10,
      limit: 50,
      includeLeeches: false,
      setIdOf,
      grouping: "sets" as const,
      ...over,
    });
    const ids = (over: Partial<Parameters<typeof buildDailyQueue>[0]>) =>
      buildDailyQueue(input(over)).map((it) => it.questionId);

    it("introduces whole sets, siblings back to back", () => {
      expect(ids({})).toEqual([...sets("c001"), ...sets("c002")]);
    });

    it("rounds the cap up to finish the set it cut into", () => {
      expect(ids({ newRemaining: 7 })).toEqual([...sets("c001"), ...sets("c002")]);
      expect(ids({ newRemaining: 1 })).toEqual(sets("c001"));
      expect(ids({ newRemaining: 0 })).toEqual([]);
    });

    it("finishes a partly seen set first", () => {
      const seenIds = new Set(["c001-s01-q0", "c001-s01-q1"]);
      expect(ids({ seenIds, newRemaining: 5 })).toEqual([
        "c001-s01-q2",
        "c001-s01-q3",
        "c001-s01-q4",
        ...sets("c002"),
      ]);
    });

    it("shuffles the new sets' questions and the due ones together when seeded", () => {
      const due = [review({ questionId: "c009-s01-q0", dueDate: "2025-12-20" })];
      const base = { due, seenIds: new Set(["c009-s01-q0"]), newRemaining: 15 };
      const a = ids({ ...base, shuffleSeed: 7 });
      const plain = ["c009-s01-q0", ...sets("c001"), ...sets("c002"), ...sets("c003")];
      // Three whole sets plus the due card, all there, no longer in order.
      expect([...a].sort()).toEqual([...plain].sort());
      expect(a).not.toEqual(plain);
      // Same seed, same order; another seed, another order.
      expect(ids({ ...base, shuffleSeed: 7 })).toEqual(a);
      expect(ids({ ...base, shuffleSeed: 8 })).not.toEqual(a);
    });

    it("gathers due siblings next to each other", () => {
      const due = [
        review({ questionId: "c001-s01-q0", dueDate: "2025-12-20" }),
        review({ questionId: "c002-s01-q0", dueDate: "2025-12-21" }),
        review({ questionId: "c001-s01-q1", dueDate: "2025-12-22" }),
      ];
      expect(ids({ due, seenIds: new Set(due.map((s) => s.questionId)), newRemaining: 0 })).toEqual(
        ["c001-s01-q0", "c001-s01-q1", "c002-s01-q0"],
      );
    });
  });
});

describe("interleaveSiblings", () => {
  const keyOf = (s: string) => s[0];

  it("leaves an already spread list untouched", () => {
    const items = ["a1", "b1", "a2", "c1"];
    expect(interleaveSiblings(items, keyOf)).toEqual(items);
  });

  it("swaps a repeated key with the nearest different one and keeps the rest stable", () => {
    expect(interleaveSiblings(["a1", "a2", "b1", "a3", "c1"], keyOf)).toEqual([
      "a1",
      "b1",
      "a2",
      "c1",
      "a3",
    ]);
    const out = interleaveSiblings(["a1", "a2", "a3", "b1", "b2", "c1", "c2"], keyOf);
    for (let i = 1; i < out.length; i++) expect(keyOf(out[i])).not.toBe(keyOf(out[i - 1]));
    expect([...out].sort()).toEqual(["a1", "a2", "a3", "b1", "b2", "c1", "c2"]);
  });

  it("gives up gracefully when no different key sits within the window", () => {
    expect(interleaveSiblings(["a1", "a2", "a3"], keyOf)).toEqual(["a1", "a2", "a3"]);
    // Window 2: b1 is pulled forward as soon as it enters the window; the
    // leading run stays as it was.
    expect(interleaveSiblings(["a1", "a2", "a3", "a4", "a5", "a6", "a7", "b1"], keyOf, 2)).toEqual([
      "a1",
      "a2",
      "a3",
      "a4",
      "a5",
      "b1",
      "a6",
      "a7",
    ]);
  });
});

describe("computeStreak", () => {
  const today = "2026-09-19";

  it("counts consecutive days through today", () => {
    const dates = new Set(["2026-09-17", "2026-09-18", "2026-09-19"]);
    expect(computeStreak(dates, today)).toEqual({ current: 3, longest: 3, studiedToday: true });
  });

  it("keeps a streak alive until tonight when today is still unstudied", () => {
    const dates = new Set(["2026-09-17", "2026-09-18"]);
    expect(computeStreak(dates, today)).toEqual({ current: 2, longest: 2, studiedToday: false });
  });

  it("breaks on a gap and remembers the longest run", () => {
    const dates = new Set(["2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11", "2026-09-19"]);
    expect(computeStreak(dates, today)).toEqual({ current: 1, longest: 4, studiedToday: true });
    expect(computeStreak(new Set(["2026-09-10"]), today)).toEqual({
      current: 0,
      longest: 1,
      studiedToday: false,
    });
    expect(computeStreak(new Set(), today)).toEqual({
      current: 0,
      longest: 0,
      studiedToday: false,
    });
  });
});

describe("categoryMastery", () => {
  it("counts known as review and mature as review with a long interval", () => {
    const rows: Pick<SrsState, "state" | "intervalDays">[] = [
      { state: "review", intervalDays: 30 },
      { state: "review", intervalDays: 21 },
      { state: "review", intervalDays: 5 },
      { state: "learning", intervalDays: 1 },
      { state: "relearning", intervalDays: 9 },
      { state: "new", intervalDays: 0 },
    ];
    expect(categoryMastery(rows, 100)).toEqual({ seen: 6, known: 3, mature: 2, mastery: 0.02 });
    expect(categoryMastery([], 0)).toEqual({ seen: 0, known: 0, mature: 0, mastery: 0 });
  });
});

describe("applyReview — hard and easy", () => {
  const at = { localDate: "2026-09-25", now: "2026-09-25T10:00:00Z" };
  const review = (intervalDays: number, ease = 2.5) => ({
    ...newState("x", "2026-09-01"),
    state: "review" as const,
    intervalDays,
    ease,
    reps: 5,
  });

  it("keeps a shaky new or learning card learning, due tomorrow", () => {
    const s = applyReview(newState("x", at.localDate), "hard", at);
    expect(s).toMatchObject({ state: "learning", intervalDays: 1, dueDate: "2026-09-26" });
    const again = applyReview(s, "hard", at);
    expect(again.state).toBe("learning");
  });

  it("grows a review slowly on hard and lowers the ease", () => {
    const s = applyReview(review(10), "hard", at);
    expect(s).toMatchObject({ state: "review", intervalDays: 12, ease: 2.35 });
    expect(applyReview(review(1, 1.3), "hard", at)).toMatchObject({ intervalDays: 2, ease: 1.3 });
  });

  it("graduates an easy new card straight to four days", () => {
    const s = applyReview(newState("x", at.localDate), "easy", at);
    expect(s).toMatchObject({ state: "review", intervalDays: 4, dueDate: "2026-09-29" });
  });

  it("grows a review beyond good on easy and raises the ease", () => {
    const good = applyReview(review(10), "good", at);
    const easy = applyReview(review(10), "easy", at);
    expect(easy.intervalDays).toBe(33);
    expect(easy.intervalDays).toBeGreaterThan(good.intervalDays);
    expect(easy.ease).toBe(2.65);
  });
});
