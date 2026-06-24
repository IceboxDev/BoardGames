import { describe, expect, it } from "vitest";
import type { MatchOutcome } from "../protocol/http/history.ts";
import {
  deriveParticipantResult,
  extractParticipantIds,
  freeForAllPlacement,
  participantPerformanceCredit,
  participatedIn,
} from "./participant-results.ts";

const p = (userId: string, displayName = userId) => ({ userId, displayName });

describe("extractParticipantIds", () => {
  it("collects ids from every slot of each kind", () => {
    const teams: MatchOutcome = {
      kind: "teams",
      teams: [{ members: [p("a"), p("b")] }, { members: [p("c")] }],
      winnerTeamIndices: [0],
      moderator: p("mod"),
    };
    expect(new Set(extractParticipantIds(teams))).toEqual(new Set(["a", "b", "c", "mod"]));

    const ovm: MatchOutcome = {
      kind: "one-vs-many",
      solo: p("solo"),
      team: { members: [p("x"), p("y")] },
      winnerSide: "team",
    };
    expect(new Set(extractParticipantIds(ovm))).toEqual(new Set(["solo", "x", "y"]));
  });

  it("participatedIn reflects membership", () => {
    const coop: MatchOutcome = {
      kind: "coop",
      participants: [p("a"), p("b")],
      outcome: "win",
    };
    expect(participatedIn(coop, "a")).toBe(true);
    expect(participatedIn(coop, "z")).toBe(false);
  });
});

describe("deriveParticipantResult", () => {
  it("free-for-all: highest score wins, ties are shared wins", () => {
    const o: MatchOutcome = {
      kind: "free-for-all",
      players: [
        { ...p("a"), score: 10 },
        { ...p("b"), score: 10 },
        { ...p("c"), score: 3 },
      ],
    };
    expect(deriveParticipantResult(o, "a")).toBe("win");
    expect(deriveParticipantResult(o, "b")).toBe("win");
    expect(deriveParticipantResult(o, "c")).toBe("loss");
    expect(deriveParticipantResult(o, "absent")).toBe(null);
  });

  it("free-for-all: lowestWins flips the winner (Phase 10 / Bandit)", () => {
    // Real shape of the bug: Mantas's 380 is the lowest, so he wins a penalty game.
    const o: MatchOutcome = {
      kind: "free-for-all",
      players: [
        { ...p("m"), score: 380 },
        { ...p("j"), score: 395 },
        { ...p("x"), score: 740 },
        { ...p("k"), score: 430 },
      ],
    };
    // highest-wins (default) → x; lowest-wins → m
    expect(deriveParticipantResult(o, "m")).toBe("loss");
    expect(deriveParticipantResult(o, "m", true)).toBe("win");
    expect(deriveParticipantResult(o, "x", true)).toBe("loss");
  });

  it("free-for-all: explicit rank 1 wins even with zero scores (Villainous)", () => {
    const o: MatchOutcome = {
      kind: "free-for-all",
      players: [
        { ...p("a"), score: 0, rank: 1 },
        { ...p("b"), score: 0, rank: 2 },
      ],
    };
    expect(deriveParticipantResult(o, "a")).toBe("win");
    expect(deriveParticipantResult(o, "b")).toBe("loss");
  });

  it("teams: win by winning team index; moderator is non-competing", () => {
    const o: MatchOutcome = {
      kind: "teams",
      teams: [{ members: [p("a")] }, { members: [p("b")] }],
      winnerTeamIndices: [1],
      moderator: p("mod"),
    };
    expect(deriveParticipantResult(o, "b")).toBe("win");
    expect(deriveParticipantResult(o, "a")).toBe("loss");
    expect(deriveParticipantResult(o, "mod")).toBe("moderator");
    expect(deriveParticipantResult(o, "absent")).toBe(null);
  });

  it("last-standing: survivor wins, eliminated lose", () => {
    const o: MatchOutcome = {
      kind: "last-standing",
      players: [{ ...p("a") }, { ...p("b"), eliminationOrder: 1 }],
    };
    expect(deriveParticipantResult(o, "a")).toBe("win");
    expect(deriveParticipantResult(o, "b")).toBe("loss");
  });

  it("coop: everyone shares the outcome", () => {
    const win: MatchOutcome = { kind: "coop", participants: [p("a"), p("b")], outcome: "win" };
    const loss: MatchOutcome = { kind: "coop", participants: [p("a")], outcome: "loss" };
    expect(deriveParticipantResult(win, "a")).toBe("win");
    expect(deriveParticipantResult(win, "b")).toBe("win");
    expect(deriveParticipantResult(loss, "a")).toBe("loss");
    expect(deriveParticipantResult(loss, "z")).toBe(null);
  });

  it("one-vs-many: winning side wins", () => {
    const o: MatchOutcome = {
      kind: "one-vs-many",
      solo: p("solo"),
      team: { members: [p("x"), p("y")] },
      winnerSide: "solo",
    };
    expect(deriveParticipantResult(o, "solo")).toBe("win");
    expect(deriveParticipantResult(o, "x")).toBe("loss");
    expect(deriveParticipantResult(o, "absent")).toBe(null);
  });
});

describe("freeForAllPlacement", () => {
  const ffa = (...scores: number[]): MatchOutcome => ({
    kind: "free-for-all",
    players: scores.map((s, i) => ({ ...p(`p${i}`), score: s })),
  });

  it("places by score, highest-wins by default", () => {
    const o = ffa(59, 50, 40) as Extract<MatchOutcome, { kind: "free-for-all" }>;
    expect(freeForAllPlacement(o, "p0")).toEqual({ place: 1, total: 3 });
    expect(freeForAllPlacement(o, "p1")).toEqual({ place: 2, total: 3 });
    expect(freeForAllPlacement(o, "p2")).toEqual({ place: 3, total: 3 });
  });

  it("places by score with lowestWins (Bandit: lower is better)", () => {
    // scores 50, 20, 28, 90, 100, 70.
    // lowest-wins: only 20 is below 28 → 2nd. highest-wins: 50/70/90/100 above → 5th.
    const o = ffa(50, 20, 28, 90, 100, 70) as Extract<MatchOutcome, { kind: "free-for-all" }>;
    expect(freeForAllPlacement(o, "p2", true)).toEqual({ place: 2, total: 6 });
    expect(freeForAllPlacement(o, "p2", false)).toEqual({ place: 5, total: 6 });
  });

  it("ties share a place", () => {
    const o = ffa(10, 10, 3) as Extract<MatchOutcome, { kind: "free-for-all" }>;
    expect(freeForAllPlacement(o, "p0")).toEqual({ place: 1, total: 3 });
    expect(freeForAllPlacement(o, "p1")).toEqual({ place: 1, total: 3 });
    expect(freeForAllPlacement(o, "p2")).toEqual({ place: 3, total: 3 });
  });
});

describe("participantPerformanceCredit (Scheme A)", () => {
  it("win = 1, free-for-all loss = linear placement credit", () => {
    const o: MatchOutcome = {
      kind: "free-for-all",
      players: [
        { ...p("a"), score: 61 },
        { ...p("b"), score: 58 },
        { ...p("c"), score: 40 },
        { ...p("d"), score: 30 },
        { ...p("e"), score: 20 },
      ],
    };
    expect(participantPerformanceCredit(o, "a", "7-wonders")).toBe(1);
    expect(participantPerformanceCredit(o, "b", "7-wonders")).toBe(0.75); // 2nd of 5
    expect(participantPerformanceCredit(o, "e", "7-wonders")).toBe(0); // last
  });

  it("lowest-wins penalty game grades placement in the right direction", () => {
    const o: MatchOutcome = {
      kind: "free-for-all",
      players: [
        { ...p("m"), score: 380 },
        { ...p("j"), score: 395 },
        { ...p("x"), score: 740 },
        { ...p("k"), score: 430 },
      ],
    };
    expect(participantPerformanceCredit(o, "m", "phase-10")).toBe(1); // lowest → win
    expect(participantPerformanceCredit(o, "x", "phase-10")).toBe(0); // highest → last of 4
  });

  it("non-competitive results are excluded (null)", () => {
    const mod: MatchOutcome = {
      kind: "teams",
      teams: [{ members: [p("a")] }, { members: [p("b")] }],
      winnerTeamIndices: [0],
      moderator: p("mod"),
    };
    expect(participantPerformanceCredit(mod, "mod")).toBeNull();
    const scoredCoop: MatchOutcome = { kind: "coop", participants: [p("a")], score: 9 };
    expect(participantPerformanceCredit(scoredCoop, "a")).toBeNull();
    expect(participantPerformanceCredit(mod, "absent")).toBeNull();
  });

  it("team / point-less losses are a flat 0", () => {
    const teamLoss: MatchOutcome = {
      kind: "teams",
      teams: [{ members: [p("a")] }, { members: [p("b")] }],
      winnerTeamIndices: [1],
    };
    expect(participantPerformanceCredit(teamLoss, "a")).toBe(0);
    const villainLoss: MatchOutcome = {
      kind: "free-for-all",
      players: [
        { ...p("a"), score: 0, rank: 1 },
        { ...p("b"), score: 0, rank: 2 },
        { ...p("c"), score: 0, rank: 3 },
      ],
    };
    expect(participantPerformanceCredit(villainLoss, "b", "villainous")).toBe(0);
  });
});
