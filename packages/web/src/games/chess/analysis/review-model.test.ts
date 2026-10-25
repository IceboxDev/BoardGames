import { describe, expect, it } from "vitest";
import type { PositionEval, Score } from "./grade";
import {
  bandOf,
  flawsOf,
  judge,
  keyMoments,
  type MoveStory,
  practiceQueue,
  storyOf,
} from "./review-model";

const ev = (score: Score, best: string | null = null): PositionEval => ({
  score,
  best,
  pv: best ? [best] : [],
  depth: 14,
});
const W = (uci: string) => ({ uci, by: "w" as const });
const B = (uci: string) => ({ uci, by: "b" as const });

describe("bandOf", () => {
  it("reads a score from either side", () => {
    expect(bandOf({ cp: 0 }, "w")).toBe("equal");
    expect(bandOf({ cp: 300 }, "w")).toBe("winning");
    expect(bandOf({ cp: 300 }, "b")).toBe("losing");
    expect(bandOf({ mate: -2 }, "b")).toBe("winning");
  });
});

describe("storyOf", () => {
  it("waits for both evaluations", () => {
    expect(storyOf([W("e2e4")], [ev({ cp: 20 })], 0)).toBeNull();
  });
  it("calls the engine's own move best", () => {
    const s = storyOf([W("e2e4")], [ev({ cp: 20 }, "e2e4"), ev({ cp: 20 })], 0);
    expect(s).toMatchObject({ grade: "best", words: "Best move", best: "e2e4" });
  });
  it("tells a blunder that turns the game lost", () => {
    const s = storyOf([W("d1h5")], [ev({ cp: 30 }, "e2e4"), ev({ cp: -500 })], 0);
    expect(s?.grade).toBe("blunder");
    expect(s?.words).toBe("Turns it lost");
  });
  it("tells a thrown-away win and a lost advantage, from Black's side too", () => {
    expect(storyOf([B("a7a6")], [ev({ cp: -600 }, "x"), ev({ cp: 0 })], 0)?.words).toBe(
      "Throws the win away",
    );
    expect(storyOf([W("a2a3")], [ev({ cp: 250 }, "x"), ev({ cp: 10 })], 0)?.words).toBe(
      "Lets the advantage go",
    );
  });
  it("tells missed and allowed mates", () => {
    expect(storyOf([W("a2a3")], [ev({ mate: 3 }, "x"), ev({ cp: 900 })], 0)?.words).toBe(
      "Misses mate in 3",
    );
    expect(storyOf([B("a7a6")], [ev({ cp: 0 }, "x"), ev({ mate: 2 })], 0)?.words).toBe(
      "Allows mate in 2",
    );
  });
});

describe("keyMoments and practice", () => {
  const story = (index: number, by: "w" | "b", drop: number, grade: MoveStory["grade"]) =>
    ({
      index,
      by,
      drop,
      grade,
      before: { cp: 0 },
      after: { cp: 0 },
      words: "",
      best: null,
    }) as MoveStory;
  const stories = [
    story(0, "w", 0, "best"),
    story(1, "b", 35, "blunder"),
    story(2, "w", 22, "mistake"),
    story(3, "b", 12, "inaccuracy"),
    null,
    story(5, "w", 40, "blunder"),
  ];
  it("keeps the biggest swings, in game order", () => {
    expect(keyMoments(stories, 2).map((s) => s.index)).toEqual([1, 5]);
    expect(keyMoments(stories).map((s) => s.index)).toEqual([1, 2, 5]);
  });
  it("deals one side's mistakes and blunders", () => {
    expect(practiceQueue(stories, ["w"])).toEqual([2, 5]);
    expect(practiceQueue(stories, ["w", "b"])).toEqual([1, 2, 5]);
  });
  it("lists a side's flaws, inaccuracies included", () => {
    expect(flawsOf(stories, "b")).toEqual([1, 3]);
  });
});

describe("judge", () => {
  it("grades an answer against the best", () => {
    expect(judge({ cp: 200 }, { cp: 190 }, "w").verdict).toBe("best");
    expect(judge({ cp: 200 }, { cp: 120 }, "w").verdict).toBe("keeps");
    expect(judge({ cp: 200 }, { cp: -100 }, "w").verdict).toBe("miss");
    expect(judge({ cp: -200 }, { cp: 100 }, "b").verdict).toBe("miss");
  });
});
