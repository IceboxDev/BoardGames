import { describe, expect, it } from "vitest";
import { JUST_ONE_SCORES, justOneTier } from "./scoring";

describe("justOneTier", () => {
  it.each([
    [0, "Eek… What happened?"],
    [3, "Eek… What happened?"],
    [4, "Not bad. You could certainly do better."],
    [6, "Not bad. You could certainly do better."],
    [7, "Average. It's a good start. Try again!"],
    [8, "Average. It's a good start. Try again!"],
    [9, "Good. A first step towards glory?"],
    [10, "Good. A first step towards glory?"],
    [11, "Very good! You should be proud!"],
    [12, "Impressive! You are almost champions!"],
    [13, "Incredible! A perfect score!"],
  ])("maps a score of %i to its tier", (score, tier) => {
    expect(justOneTier(score)).toBe(tier);
  });
});

describe("JUST_ONE_SCORES", () => {
  it("lists every score from 0 to 13", () => {
    expect(JUST_ONE_SCORES).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });
});
