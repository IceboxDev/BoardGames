import type { PlayerSkillResponse } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import type { SkillRatingStatus, StoredSkillState } from "./skill-ratings.ts";
import { candidatesFor, greetingUserIds, payloadFor } from "./spotlight-payload.ts";

function player(userId: string, ratedMatches: number): PlayerSkillResponse {
  return {
    userId,
    eligibility: { eligible: true, ratedMatches, distinctGames: 5, minMatches: 8, minGames: 3 },
    traits: null,
    games: [],
    ratedSlugs: [],
    highlights: [],
  };
}

function state(order: readonly string[], ratedMatches: number): StoredSkillState {
  return {
    eligibleCount: order.length,
    players: Object.fromEntries(order.map((id) => [id, player(id, ratedMatches)])),
    leaderboards: {
      traits: [
        {
          trait: "pln",
          entries: order.map((userId, i) => ({
            userId,
            rank: i + 1,
            percentile: 90 - i * 10,
            score: 80 - i * 5,
          })),
        },
      ],
      games: [],
    },
    streaks: [],
  };
}

const BEFORE = state(["a", "b", "c", "d", "e"], 20);
const AFTER = state(["d", "a", "b", "c", "e"], 23);

function status(overrides: Partial<SkillRatingStatus> = {}): SkillRatingStatus {
  return {
    state: AFTER,
    baseline: BEFORE,
    computedAt: "2026-08-19 20:00:00",
    baselineComputedAt: "2026-08-12 20:00:00",
    configVersion: 5,
    stale: false,
    matchesTotal: 90,
    matchesChangedSince: 0,
    ...overrides,
  };
}

describe("candidatesFor", () => {
  it("ranks what moved between the two stored payloads", () => {
    const candidates = candidatesFor(status());
    expect(candidates.map((c) => c.key)).toEqual(["trait-climb:pln:d"]);
  });

  it("stays empty without a baseline to compare against", () => {
    expect(candidatesFor(status({ baseline: null }))).toEqual([]);
    expect(candidatesFor(status({ state: null }))).toEqual([]);
  });
});

describe("payloadFor", () => {
  it("freezes the event and the board it is claiming", () => {
    const built = payloadFor(AFTER, candidatesFor(status()), "trait-climb:pln:d");
    expect(built?.subjectUserId).toBe("d");
    expect(built?.payload.event).toEqual({
      kind: "trait-climb",
      trait: "pln",
      from: 4,
      to: 1,
      fieldSize: 5,
    });
    // Top three of the board as it stands; the subject leads it, so no fourth row.
    expect(built?.payload.proof?.rows).toEqual([
      { userId: "d", rank: 1, value: "80" },
      { userId: "a", rank: 2, value: "75" },
      { userId: "b", rank: 3, value: "70" },
    ]);
  });

  it("appends the subject's own row when they finished outside the top three", () => {
    const before = state(["a", "b", "c", "d", "e"], 20);
    const after = state(["a", "b", "c", "e", "d"], 23);
    const candidates = candidatesFor(status({ baseline: before, state: after }));
    const built = payloadFor(after, candidates, "trait-climb:pln:e");
    expect(built?.payload.proof?.rows.map((r) => r.userId)).toEqual(["a", "b", "c", "e"]);
  });

  it("refuses a key that is no longer on offer", () => {
    expect(payloadFor(AFTER, candidatesFor(status()), "trait-climb:pln:nobody")).toBeNull();
  });

  it("keeps the admin's pick as the headline when they override the ranking", () => {
    const before = state(["a", "b", "c", "d", "e"], 20);
    const after: StoredSkillState = {
      ...state(["d", "a", "b", "c", "e"], 23),
      streaks: [{ userId: "b", length: 4 }],
    };
    const candidates = candidatesFor(status({ baseline: before, state: after }));
    expect(candidates[0].key).toBe("trait-climb:pln:d");

    const built = payloadFor(after, candidates, "streak-lead:b");
    expect(built?.subjectUserId).toBe("b");
    expect(built?.payload.runnersUp.map((r) => r.userId)).toEqual(["d"]);
    // A streak has no board of its own to show.
    expect(built?.payload.proof).toBeNull();
  });
});

describe("greetingUserIds", () => {
  it("collects the subject, the runners-up and every proof row", () => {
    const ids = greetingUserIds({
      kind: "spotlight",
      id: 1,
      subjectUserId: "d",
      payload: {
        event: { kind: "streak-lead", length: 4 },
        runnersUp: [{ userId: "z", event: { kind: "streak-lead", length: 3 } }],
        proof: { rows: [{ userId: "a", rank: 1, value: "80" }] },
      },
    });
    expect([...ids].sort()).toEqual(["a", "d", "z"]);
  });

  it("has nothing to resolve for the intro or an empty queue", () => {
    expect(greetingUserIds(null).size).toBe(0);
    expect(
      greetingUserIds({ kind: "skill-intro", highlight: { kind: "trait-first", trait: "int" } })
        .size,
    ).toBe(0);
  });
});
