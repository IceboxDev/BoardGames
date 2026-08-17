import { describe, expect, it } from "vitest";
import type { MatchOutcome } from "../protocol/http/history.ts";
import { matchEvidence, scoredCoopEvidence } from "./comparisons.ts";

const p = (id: string) => ({ userId: id, displayName: id });

describe("matchEvidence — free-for-all", () => {
  it("emits full pairwise comparisons from scores, ties as 0.5", () => {
    const outcome: MatchOutcome = {
      kind: "free-for-all",
      players: [
        { ...p("a"), score: 30 },
        { ...p("b"), score: 20 },
        { ...p("c"), score: 20 },
      ],
    };
    const ev = matchEvidence("jaipur", outcome);
    expect(ev?.competitors).toEqual(["a", "b", "c"]);
    expect(ev?.comparisons).toHaveLength(3);
    const byPair = new Map(ev?.comparisons.map((c) => [`${c.a[0]}${c.b?.[0]}`, c.score]));
    expect(byPair.get("ab")).toBe(1);
    expect(byPair.get("ac")).toBe(1);
    expect(byPair.get("bc")).toBe(0.5);
    for (const c of ev?.comparisons ?? []) expect(c.weight).toBeCloseTo(2 / 3);
  });

  it("respects lowest-wins scoring for penalty games", () => {
    const outcome: MatchOutcome = {
      kind: "free-for-all",
      players: [
        { ...p("a"), score: 50 },
        { ...p("b"), score: 10 },
      ],
    };
    const ev = matchEvidence("phase-10", outcome);
    expect(ev?.comparisons).toEqual([{ a: ["a"], b: ["b"], score: 0, weight: 1 }]);
  });

  it("drops loser-vs-loser pairs in point-less games without a full rank order", () => {
    const outcome: MatchOutcome = {
      kind: "free-for-all",
      players: [
        { ...p("a"), score: 0, rank: 1 },
        { ...p("b"), score: 0 },
        { ...p("c"), score: 0 },
      ],
    };
    const ev = matchEvidence("lovecraft-letter", outcome);
    // Winner beats each loser; the b-vs-c order was never recorded.
    expect(ev?.comparisons).toHaveLength(2);
    expect(ev?.comparisons.every((c) => c.a[0] === "a" && c.score === 1)).toBe(true);
  });

  it("treats a drawn duel as a 0.5 pair", () => {
    const outcome: MatchOutcome = {
      kind: "free-for-all",
      draw: true,
      players: [
        { ...p("a"), score: 0 },
        { ...p("b"), score: 0 },
      ],
    };
    expect(matchEvidence("chess", outcome)?.comparisons).toEqual([
      { a: ["a"], b: ["b"], score: 0.5, weight: 1 },
    ]);
  });
});

describe("matchEvidence — last-standing", () => {
  it("uses the knockout order as a full finishing order", () => {
    const outcome: MatchOutcome = {
      kind: "last-standing",
      players: [
        { ...p("a") }, // survivor → 1st
        { ...p("b"), eliminationOrder: 2 }, // out last → 2nd
        { ...p("c"), eliminationOrder: 1 }, // out first → 3rd
      ],
    };
    const ev = matchEvidence("exploding-kittens", outcome);
    const byPair = new Map(ev?.comparisons.map((c) => [`${c.a[0]}${c.b?.[0]}`, c.score]));
    expect(byPair.get("ab")).toBe(1);
    expect(byPair.get("ac")).toBe(1);
    expect(byPair.get("bc")).toBe(1);
  });
});

describe("matchEvidence — teams", () => {
  it("emits winner-vs-loser pairs only when no team ranks exist", () => {
    const outcome: MatchOutcome = {
      kind: "teams",
      teams: [
        { members: [p("a"), p("b")] },
        { members: [p("c"), p("d")] },
        { members: [p("e"), p("f")] },
      ],
      winnerTeamIndices: [0, 1],
    };
    const ev = matchEvidence("decrypto", outcome);
    // a,b beat e,f and c,d beat e,f — no evidence between the two winners.
    expect(ev?.comparisons).toHaveLength(2);
    expect(ev?.comparisons.every((c) => c.score === 1 && c.b?.includes("e"))).toBe(true);
    for (const c of ev?.comparisons ?? []) expect(c.weight).toBeCloseTo(2 / 3);
  });

  it("excludes the moderator from competitors", () => {
    const outcome: MatchOutcome = {
      kind: "teams",
      teams: [{ members: [p("a")] }, { members: [p("b")] }],
      winnerTeamIndices: [0],
      moderator: p("mod"),
    };
    const ev = matchEvidence("blood-on-the-clocktower", outcome);
    expect(ev?.competitors).toEqual(["a", "b"]);
  });
});

describe("matchEvidence — one-vs-many and coop", () => {
  it("scores the solo side against the team", () => {
    const outcome: MatchOutcome = {
      kind: "one-vs-many",
      solo: p("x"),
      team: { members: [p("a"), p("b")] },
      winnerSide: "team",
    };
    expect(matchEvidence("scotland-yard", outcome)?.comparisons).toEqual([
      { a: ["x"], b: ["a", "b"], score: 0, weight: 1 },
    ]);
  });

  it("plays a resolved co-op against the baseline opponent", () => {
    const outcome: MatchOutcome = {
      kind: "coop",
      participants: [p("a"), p("b")],
      outcome: "win",
    };
    expect(matchEvidence("pandemic", outcome)?.comparisons).toEqual([
      { a: ["a", "b"], b: null, score: 1, weight: 1 },
    ]);
  });

  it("carries no stand-alone evidence for scored or unresolved co-ops", () => {
    const scored: MatchOutcome = {
      kind: "coop",
      participants: [p("a")],
      score: 12,
    };
    expect(matchEvidence("just-one", scored)).toBeNull();
    const unresolved: MatchOutcome = {
      kind: "coop",
      participants: [p("a")],
      campaign: "Curse of Strahd",
    };
    expect(matchEvidence("dungeons-and-dragons", unresolved)).toBeNull();
  });
});

describe("scoredCoopEvidence — cross-session score comparisons", () => {
  const session = (members: string[], score: number, lambda = 1) => ({ members, score, lambda });

  it("orders sessions by team score with FFA-style 2/S weights", () => {
    const out = scoredCoopEvidence("just-one", [
      session(["a", "b"], 12),
      session(["c", "d"], 5),
      session(["e"], 9),
    ]);
    expect(out).toEqual([
      { a: ["a", "b"], b: ["c", "d"], score: 1, weight: 2 / 3 },
      { a: ["a", "b"], b: ["e"], score: 1, weight: 2 / 3 },
      { a: ["c", "d"], b: ["e"], score: 0, weight: 2 / 3 },
    ]);
  });

  it("ties equal scores and decays each pair by its older session's λ", () => {
    const out = scoredCoopEvidence("just-one", [session(["a"], 7, 1), session(["b"], 7, 0.5)]);
    expect(out).toEqual([{ a: ["a"], b: ["b"], score: 0.5, weight: 1 * 0.5 }]);
  });

  it("respects lowest-wins scoring", () => {
    const out = scoredCoopEvidence("phase-10", [session(["a"], 10), session(["b"], 50)]);
    expect(out[0]).toMatchObject({ a: ["a"], b: ["b"], score: 1 });
  });

  it("skips pairs between identical rosters (zero pairwise information)", () => {
    const out = scoredCoopEvidence("just-one", [
      session(["a", "b"], 12),
      session(["b", "a"], 5),
      session(["c"], 9),
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((c) => c.a.includes("c") || c.b?.includes("c"))).toBe(true);
  });

  it("yields nothing for fewer than two sessions", () => {
    expect(scoredCoopEvidence("just-one", [session(["a"], 12)])).toEqual([]);
    expect(scoredCoopEvidence("just-one", [])).toEqual([]);
  });
});
