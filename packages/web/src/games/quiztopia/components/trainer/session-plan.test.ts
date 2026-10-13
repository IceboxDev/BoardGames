import type { TrainerOverview } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { articlesToRead, studyAllPlan } from "./session-plan";

const item = (setId: string, tier: string, setStarted?: boolean) => ({
  setId,
  cardId: setId.slice(0, 4),
  category: 12,
  tier,
  setStarted,
});

describe("articlesToRead", () => {
  it("reads each new article once, in deal order", () => {
    expect(
      articlesToRead([
        item("c077-s12", "new"),
        item("c107-s12", "review"),
        item("c124-s12", "new"),
        item("c077-s12", "new"),
      ]).map((a) => a.setId),
    ).toEqual(["c077-s12", "c124-s12"]);
  });

  // Yesterday's sitting ended one question short of the article: the
  // leftover is dealt today without the whole article being read again.
  it("skips an article begun on an earlier sitting", () => {
    expect(
      articlesToRead([
        item("c089-s12", "new", true),
        item("c124-s12", "new", false),
        item("c156-s12", "new", true),
      ]).map((a) => a.setId),
    ).toEqual(["c124-s12"]);
  });

  it("treats a queue from a server without the flag as all fresh", () => {
    expect(articlesToRead([item("c089-s12", "new")])).toHaveLength(1);
  });
});

describe("studyAllPlan", () => {
  const cat = (n: number, over: Partial<TrainerOverview["categories"][number]> = {}) => ({
    n,
    total: 75,
    seen: 4,
    due: 2,
    learningDue: 1,
    newAvailable: 71,
    newRemainingToday: 15,
    leftoverToday: 0,
    known: 3,
    mature: 0,
    mastery: 0,
    retention30: null,
    reviews30: 4,
    leeches: 0,
    ...over,
  });
  const settings = {
    language: "en",
    newPerDay: 10,
    newPerDayByCategory: {},
    includeLeeches: false,
    gameReviewsAffectSrs: false,
    newCardOrder: "sets",
    newSetsPerDay: 3,
    excludeFromAll: [],
  } satisfies TrainerOverview["settings"];

  // A question left from an earlier sitting rides on top of the three new
  // articles — it never takes one's place.
  it("adds leftovers on top of the day's new articles", () => {
    const plan = studyAllPlan([cat(12, { leftoverToday: 1 })], settings);
    expect(plan).toMatchObject({ newUnits: 3, newQuestions: 15, leftover: 1, total: 18 });
    expect(plan.summary).toBe("2 due + 3 new articles (15 questions) + 1 to finish");
  });

  it("counts only the included districts' leftovers", () => {
    const plan = studyAllPlan([cat(1, { leftoverToday: 4 }), cat(12)], {
      ...settings,
      excludeFromAll: [1],
    });
    expect(plan.leftover).toBe(0);
  });
});
