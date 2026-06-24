import type { MatchOutcome } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import { matchResultBadge } from "./match-result-badge.ts";

const p = (userId: string, score: number, rank?: number) => ({
  userId,
  displayName: userId,
  score,
  ...(rank !== undefined ? { rank } : {}),
});

describe("matchResultBadge — score-based free-for-all (7 Wonders)", () => {
  const outcome: MatchOutcome = {
    kind: "free-for-all",
    players: [p("a", 62), p("b", 50), p("c", 40)],
  };
  it("1st place → Won (emerald)", () => {
    expect(matchResultBadge(outcome, "a", "7-wonders")).toEqual({ label: "Won", tone: "emerald" });
  });
  it("middle place → ordinal (amber)", () => {
    expect(matchResultBadge(outcome, "b", "7-wonders")).toEqual({ label: "2nd", tone: "amber" });
  });
  it("last place → Last (rose)", () => {
    expect(matchResultBadge(outcome, "c", "7-wonders")).toEqual({ label: "Last", tone: "rose" });
  });
});

describe("matchResultBadge — tie broken by explicit rank (7 Wonders)", () => {
  // a & b both scored 65; the tie was broken so a places 1st, b 2nd, c 3rd.
  const outcome: MatchOutcome = {
    kind: "free-for-all",
    players: [p("a", 65, 1), p("b", 65, 2), p("c", 40, 3)],
  };
  it("tie-break winner → Won, not a shared 2nd", () => {
    expect(matchResultBadge(outcome, "a", "7-wonders")).toEqual({ label: "Won", tone: "emerald" });
  });
  it("tie-break loser → distinct 2nd despite the equal score", () => {
    expect(matchResultBadge(outcome, "b", "7-wonders")).toEqual({ label: "2nd", tone: "amber" });
  });
  it("lowest rank → Last", () => {
    expect(matchResultBadge(outcome, "c", "7-wonders")).toEqual({ label: "Last", tone: "rose" });
  });
});

describe("matchResultBadge — lowest-wins free-for-all (Bandit)", () => {
  const outcome: MatchOutcome = {
    kind: "free-for-all",
    players: [p("a", 10), p("b", 20), p("c", 30)],
  };
  it("lowest score wins", () => {
    expect(matchResultBadge(outcome, "a", "bandit")).toEqual({ label: "Won", tone: "emerald" });
    expect(matchResultBadge(outcome, "b", "bandit")).toEqual({ label: "2nd", tone: "amber" });
    expect(matchResultBadge(outcome, "c", "bandit")).toEqual({ label: "Last", tone: "rose" });
  });
});

describe("matchResultBadge — point-less free-for-all (Villainous)", () => {
  const outcome: MatchOutcome = {
    kind: "free-for-all",
    players: [p("a", 0, 1), p("b", 0)],
  };
  it("winner (rank 1) → Won, others → Lost (no placement)", () => {
    expect(matchResultBadge(outcome, "a", "villainous")).toEqual({ label: "Won", tone: "emerald" });
    expect(matchResultBadge(outcome, "b", "villainous")).toEqual({ label: "Lost", tone: "rose" });
  });
});

describe("matchResultBadge — scored co-op (Just One)", () => {
  const scored = (score: number): MatchOutcome => ({
    kind: "coop",
    participants: [{ userId: "a", displayName: "A" }],
    score,
  });
  it("shows score / max in amber", () => {
    expect(matchResultBadge(scored(11), "a", "just-one")).toEqual({
      label: "11 / 13",
      tone: "amber",
    });
  });
  it("perfect score → green", () => {
    expect(matchResultBadge(scored(13), "a", "just-one")).toEqual({
      label: "13 / 13",
      tone: "emerald",
    });
  });
});

describe("matchResultBadge — binary co-op + absent player", () => {
  const won: MatchOutcome = {
    kind: "coop",
    participants: [{ userId: "a", displayName: "A" }],
    outcome: "win",
  };
  it("win/loss co-op → Won/Lost", () => {
    expect(matchResultBadge(won, "a", "pandemic")).toEqual({ label: "Won", tone: "emerald" });
  });
  it("returns null when the viewer isn't in the match", () => {
    expect(matchResultBadge(won, "z", "pandemic")).toBeNull();
  });
});
