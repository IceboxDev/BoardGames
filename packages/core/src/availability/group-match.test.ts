import { describe, expect, it } from "vitest";
import { rankGroupDates, scoreGroupDates } from "./group-match.ts";

const D1 = "2026-10-16";
const D2 = "2026-10-17";
const D3 = "2026-10-18";

describe("scoreGroupDates", () => {
  it("returns nothing for an empty group", () => {
    expect(scoreGroupDates({ group: [], dates: [D1], availability: {} })).toEqual({});
  });

  it("tiers a date all / most / none", () => {
    const scored = scoreGroupDates({
      group: ["a", "b", "c"],
      dates: [D1, D2, D3],
      availability: {
        [D1]: [
          { userId: "a", status: "can" },
          { userId: "b", status: "maybe" },
          { userId: "c", status: "can" },
        ],
        [D2]: [
          { userId: "a", status: "can" },
          { userId: "b", status: "can" },
          { userId: "x", status: "can" },
        ],
        [D3]: [{ userId: "a", status: "can" }],
      },
    });
    expect(scored[D1]).toMatchObject({ tier: "all", can: ["a", "c"], maybe: ["b"], missing: [] });
    expect(scored[D2]).toMatchObject({ tier: "most", missing: ["c"] });
    expect(scored[D3]).toMatchObject({ tier: "none", missing: ["b", "c"] });
  });

  it("never calls one-missing 'most' for a pair", () => {
    const scored = scoreGroupDates({
      group: ["a", "b"],
      dates: [D1],
      availability: { [D1]: [{ userId: "a", status: "can" }] },
    });
    expect(scored[D1]?.tier).toBe("none");
  });

  it("flags away notes only where the member has no mark", () => {
    const scored = scoreGroupDates({
      group: ["a", "b"],
      dates: [D1, D2],
      availability: { [D1]: [{ userId: "a", status: "can" }] },
      awayByUser: { a: [D1, D2], b: [D1] },
    });
    expect(scored[D1]).toMatchObject({ can: ["a"], missing: ["b"], away: ["b"] });
    expect(scored[D2]).toMatchObject({ missing: ["a", "b"], away: ["a"] });
  });

  it("counts an assumed-free member as free everywhere, whatever they marked", () => {
    const scored = scoreGroupDates({
      group: ["me", "a", "b"],
      dates: [D1, D2],
      availability: { [D1]: [{ userId: "a", status: "can" }] },
      awayByUser: { me: [D1, D2] },
      assumeFree: new Set(["me"]),
    });
    expect(scored[D1]).toMatchObject({
      tier: "most",
      can: ["me", "a"],
      assumed: ["me"],
      missing: ["b"],
      away: [],
    });
    expect(scored[D2]).toMatchObject({ can: ["me"], assumed: ["me"], missing: ["a", "b"] });
  });

  it("picks the free night slot and nulls a full date", () => {
    const scored = scoreGroupDates({
      group: ["a"],
      dates: [D1, D2, D3],
      availability: {},
      lockedNightKeys: new Set([D2, D3, `${D3}_2`]),
    });
    expect(scored[D1]?.nightKey).toBe(D1);
    expect(scored[D2]?.nightKey).toBe(`${D2}_2`);
    expect(scored[D3]?.nightKey).toBeNull();
  });
});

describe("rankGroupDates", () => {
  it("ranks by available, then firm cans, then date — and drops full or empty dates", () => {
    const scored = scoreGroupDates({
      group: ["a", "b", "c"],
      dates: [D1, D2, D3, "2026-10-19", "2026-10-20"],
      availability: {
        [D1]: [
          { userId: "a", status: "can" },
          { userId: "b", status: "maybe" },
          { userId: "c", status: "maybe" },
        ],
        [D2]: [
          { userId: "a", status: "can" },
          { userId: "b", status: "can" },
          { userId: "c", status: "maybe" },
        ],
        [D3]: [
          { userId: "a", status: "can" },
          { userId: "b", status: "can" },
          { userId: "c", status: "can" },
        ],
        "2026-10-19": [{ userId: "a", status: "can" }],
      },
      lockedNightKeys: new Set([D3, `${D3}_2`]),
    });
    expect(rankGroupDates(scored).map((m) => m.date)).toEqual([D2, D1, "2026-10-19"]);
  });

  it("never offers a date only the assumed-free searcher is free on", () => {
    const scored = scoreGroupDates({
      group: ["me", "a"],
      dates: [D1, D2],
      availability: { [D2]: [{ userId: "me", status: "can" }] },
      assumeFree: new Set(["me"]),
    });
    expect(rankGroupDates(scored)).toEqual([]);
  });
});
