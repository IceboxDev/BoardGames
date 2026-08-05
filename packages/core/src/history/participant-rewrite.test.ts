import { describe, expect, it } from "vitest";
import type { MatchOutcome } from "../protocol/http/history.ts";
import { extractParticipantIds } from "./participant-results.ts";
import { replaceParticipant } from "./participant-rewrite.ts";

const p = (userId: string, displayName = userId) => ({ userId, displayName });
const TO = { userId: "real-id", displayName: "Stanislao Alessandri" };

describe("replaceParticipant", () => {
  it("rewrites id + display name in free-for-all players", () => {
    const o: MatchOutcome = {
      kind: "free-for-all",
      players: [
        { ...p("guest-id", "Stanislao"), score: 40 },
        { ...p("b"), score: 55 },
      ],
    };
    const out = replaceParticipant(o, "guest-id", TO);
    expect(out).not.toBeNull();
    if (out?.kind === "free-for-all") {
      expect(out.players[0]).toMatchObject({
        userId: "real-id",
        displayName: "Stanislao Alessandri",
        score: 40,
      });
      expect(out.players[1].userId).toBe("b");
    }
  });

  it("rewrites team members and the teams moderator", () => {
    const o: MatchOutcome = {
      kind: "teams",
      teams: [{ members: [p("guest-id", "Stani")] }, { members: [p("b")] }],
      winnerTeamIndices: [0],
      moderator: p("guest-id", "Stani"),
    };
    const out = replaceParticipant(o, "guest-id", TO);
    expect(out ? extractParticipantIds(out) : []).toContain("real-id");
    if (out?.kind === "teams") {
      expect(out.moderator?.displayName).toBe("Stanislao Alessandri");
    }
  });

  it("rewrites coop participants, the DM, and one-vs-many slots", () => {
    const coop: MatchOutcome = {
      kind: "coop",
      participants: [p("guest-id")],
      moderator: p("dm"),
      outcome: "win",
    };
    const coopOut = replaceParticipant(coop, "guest-id", TO);
    expect(coopOut ? extractParticipantIds(coopOut) : []).toEqual(
      expect.arrayContaining(["real-id", "dm"]),
    );

    const ovm: MatchOutcome = {
      kind: "one-vs-many",
      solo: p("guest-id"),
      team: { members: [p("x")] },
      winnerSide: "solo",
    };
    const ovmOut = replaceParticipant(ovm, "guest-id", TO);
    if (ovmOut?.kind === "one-vs-many") {
      expect(ovmOut.solo.userId).toBe("real-id");
    }
  });

  it("returns null when the outcome doesn't name the id", () => {
    const o: MatchOutcome = {
      kind: "last-standing",
      players: [p("a"), { ...p("b"), eliminationOrder: 1 }],
    };
    expect(replaceParticipant(o, "guest-id", TO)).toBeNull();
  });

  it("preserves per-player fields (rank, role, elimination order)", () => {
    const o: MatchOutcome = {
      kind: "last-standing",
      players: [{ ...p("guest-id", "Stani"), eliminationOrder: 2, role: "Barbarian" }, p("w")],
    };
    const out = replaceParticipant(o, "guest-id", TO);
    if (out?.kind === "last-standing") {
      expect(out.players[0]).toMatchObject({
        userId: "real-id",
        displayName: "Stanislao Alessandri",
        eliminationOrder: 2,
        role: "Barbarian",
      });
    }
  });
});
