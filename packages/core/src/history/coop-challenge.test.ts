import { describe, expect, it } from "vitest";
import {
  challengeTierIndex,
  coopChallengeSteps,
  coopScorePoolKey,
  coopScorePoolValue,
  inferQuiztopiaOutcome,
  isMarginCoop,
  QUIZTOPIA_SLUG,
  quiztopiaLossAt,
} from "./coop-challenge.ts";

describe("challengeTierIndex", () => {
  it("maps every canonical Quiztopia tier to its ladder index", () => {
    expect(challengeTierIndex(QUIZTOPIA_SLUG, "Normal")).toBe(0);
    expect(challengeTierIndex(QUIZTOPIA_SLUG, "Schwer")).toBe(1);
    expect(challengeTierIndex(QUIZTOPIA_SLUG, "Wahnsinn")).toBe(2);
    expect(challengeTierIndex(QUIZTOPIA_SLUG, "Hölle, Hölle, Hölle")).toBe(3);
  });

  it("tolerates casing and trailing free text", () => {
    expect(challengeTierIndex(QUIZTOPIA_SLUG, "hölle")).toBe(3);
    expect(challengeTierIndex(QUIZTOPIA_SLUG, "Wahnsinn + Herausforderung")).toBe(2);
  });

  it("returns null for unknown text, missing difficulty, or other slugs", () => {
    expect(challengeTierIndex(QUIZTOPIA_SLUG, "Heroic")).toBeNull();
    expect(challengeTierIndex(QUIZTOPIA_SLUG, undefined)).toBeNull();
    expect(challengeTierIndex("pandemic", "Normal")).toBeNull();
  });
});

describe("coopChallengeSteps", () => {
  it("adds one step per tier and one for Expert mode", () => {
    expect(coopChallengeSteps(QUIZTOPIA_SLUG, { difficulty: "Normal" })).toBe(0);
    expect(coopChallengeSteps(QUIZTOPIA_SLUG, { difficulty: "Wahnsinn" })).toBe(2);
    expect(
      coopChallengeSteps(QUIZTOPIA_SLUG, {
        difficulty: "Hölle, Hölle, Hölle",
        scenario: "Expert",
      }),
    ).toBe(4);
  });

  it("is zero for other co-ops and legacy rows without a matched tier", () => {
    expect(coopChallengeSteps("pandemic", { difficulty: "Heroic" })).toBe(0);
    expect(coopChallengeSteps(QUIZTOPIA_SLUG, {})).toBe(0);
  });
});

describe("coopScorePoolValue / coopScorePoolKey", () => {
  it("uses the win margin for margin co-ops and the raw score elsewhere", () => {
    expect(isMarginCoop(QUIZTOPIA_SLUG)).toBe(true);
    expect(coopScorePoolValue(QUIZTOPIA_SLUG, { score: 9, opponentScore: 3 })).toBe(6);
    expect(coopScorePoolValue(QUIZTOPIA_SLUG, { score: 4, opponentScore: 8 })).toBe(-4);
    expect(coopScorePoolValue("just-one", { score: 11 })).toBe(11);
    expect(coopScorePoolValue(QUIZTOPIA_SLUG, {})).toBeNull();
  });

  it("splits margin pools by tier and mode; plain scored co-ops pool by slug", () => {
    const normal = coopScorePoolKey(QUIZTOPIA_SLUG, { difficulty: "Normal", score: 9 });
    const wahnsinn = coopScorePoolKey(QUIZTOPIA_SLUG, { difficulty: "Wahnsinn", score: 9 });
    const expert = coopScorePoolKey(QUIZTOPIA_SLUG, {
      difficulty: "Normal",
      scenario: "Expert",
      score: 9,
    });
    expect(normal).not.toBe(wahnsinn);
    expect(normal).not.toBe(expert);
    expect(coopScorePoolKey("just-one", { score: 11 })).toBe("just-one");
  });
});

describe("inferQuiztopiaOutcome / quiztopiaLossAt", () => {
  it("wins at the tier's required buildings, loses short of it", () => {
    expect(inferQuiztopiaOutcome("Normal", 8, 3)).toBe("win");
    expect(inferQuiztopiaOutcome("Normal", 6, 5)).toBe("loss"); // out at 5 lost
    expect(inferQuiztopiaOutcome("Normal", 7, 2)).toBe("loss"); // questions ran out
    expect(inferQuiztopiaOutcome("Hölle, Hölle, Hölle", 11, 1)).toBe("win");
    expect(inferQuiztopiaOutcome("Hölle, Hölle, Hölle", 10, 2)).toBe("loss");
  });

  it("recognizes a whole-bakery run past the requirement as a win", () => {
    expect(inferQuiztopiaOutcome("Normal", 12, 0)).toBe("win");
  });

  it("is null while the record is incomplete", () => {
    expect(inferQuiztopiaOutcome(undefined, 8, 0)).toBeNull();
    expect(inferQuiztopiaOutcome("Heroic", 8, 0)).toBeNull();
    expect(inferQuiztopiaOutcome("Normal", undefined, 0)).toBeNull();
  });

  it("computes the losing threshold per tier (13 − required)", () => {
    expect([0, 1, 2, 3].map(quiztopiaLossAt)).toEqual([5, 4, 3, 2]);
  });
});
