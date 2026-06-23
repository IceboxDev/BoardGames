import { describe, expect, it } from "vitest";
import type { MatchOutcome } from "../protocol/http/history.ts";
import {
  deriveParticipantResult,
  extractParticipantIds,
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
