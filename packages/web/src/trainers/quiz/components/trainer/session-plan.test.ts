import { DEFAULT_QUIZ_SETTINGS, type TrainerOverview } from "@boardgames/core/protocol";
import { QUIZ_DOMAINS } from "@boardgames/core/quiz/taxonomy";
import { describe, expect, it } from "vitest";
import { articlesToRead, studyAllPlan } from "./session-plan";

const item = (articleId: string, tier: string, articleStarted?: boolean) => ({
  articleId,
  domain: "technology",
  tier,
  articleStarted,
});

describe("articlesToRead", () => {
  it("reads each new article once, in deal order", () => {
    expect(
      articlesToRead([
        item("a0924", "new"),
        item("a1284", "review"),
        item("a1488", "new"),
        item("a0924", "new"),
      ]).map((a) => a.articleId),
    ).toEqual(["a0924", "a1488"]);
  });

  // Yesterday's sitting ended one fact short of the article: the leftover is
  // dealt today without the whole article being read again.
  it("skips an article begun on an earlier sitting", () => {
    expect(
      articlesToRead([
        item("a1068", "new", true),
        item("a1488", "new", false),
        item("a1872", "new", true),
      ]).map((a) => a.articleId),
    ).toEqual(["a1488"]);
  });
});

describe("studyAllPlan", () => {
  const overview = (over: Partial<TrainerOverview> = {}): TrainerOverview => ({
    contentVersion: "dev",
    today: "2026-10-20",
    streak: { current: 0, longest: 0, studiedToday: false },
    todayCounts: { reviews: 0, good: 0, again: 0, newIntroduced: 0 },
    newRemainingToday: 15,
    leftoverToday: 0,
    domains: QUIZ_DOMAINS.map((d, i) => ({
      domain: d.slug,
      total: 75,
      seen: 4,
      due: i < 2 ? 2 : 0,
      learningDue: i < 2 ? 1 : 0,
      newAvailable: 71,
      known: 3,
      mature: 0,
      mastery: 0,
      retention30: null,
      reviews30: 4,
      leeches: 0,
    })),
    settings: DEFAULT_QUIZ_SETTINGS,
    ...over,
  });

  // A fact left from an earlier sitting rides on top of the day's budget —
  // it never takes a new fact's place.
  it("adds leftovers on top of the day's new facts", () => {
    const plan = studyAllPlan(overview({ leftoverToday: 1 }));
    expect(plan).toMatchObject({ due: 4, newFacts: 15, leftover: 1, total: 20 });
    expect(plan.summary).toBe("4 due + 15 new + 1 to finish");
  });

  it("counts only the included domains' due cards", () => {
    const plan = studyAllPlan(
      overview({
        settings: { ...DEFAULT_QUIZ_SETTINGS, excludeFromAll: [QUIZ_DOMAINS[0].slug] },
      }),
    );
    expect(plan.due).toBe(2);
    expect(plan.excluded).toBe(1);
  });
});
