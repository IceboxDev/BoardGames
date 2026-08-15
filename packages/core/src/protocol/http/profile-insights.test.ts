import { describe, expect, it } from "vitest";
import {
  ProfileMatchSummaryResponseSchema,
  ProfileNightsResponseSchema,
} from "./profile-insights.ts";

describe("ProfileMatchSummaryResponseSchema", () => {
  const item = {
    matchId: 41,
    dateKey: "2026-07-10",
    playedAt: "2026-07-10T19:30:00Z",
    gameSlug: "lost-cities",
    gameTitle: "Lost Cities",
    kind: "free-for-all",
    result: "win",
    credit: 1,
    place: 1,
    fieldSize: 2,
    score: null,
    sessions: 1,
    coPlayerIds: ["u2"],
  };

  it("parses a happy-path payload", () => {
    const parsed = ProfileMatchSummaryResponseSchema.parse({
      items: [item],
      players: { u2: { name: "Ada", image: null } },
    });
    expect(parsed.items[0]?.result).toBe("win");
    expect(parsed.players.u2?.name).toBe("Ada");
  });

  it("rejects an unknown result value", () => {
    const r = ProfileMatchSummaryResponseSchema.safeParse({
      items: [{ ...item, result: "victory" }],
      players: {},
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["items", 0, "result"]);
  });

  it("rejects a zero-session unit", () => {
    const r = ProfileMatchSummaryResponseSchema.safeParse({
      items: [{ ...item, sessions: 0 }],
      players: {},
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["items", 0, "sessions"]);
  });
});

describe("ProfileNightsResponseSchema", () => {
  const night = {
    dateKey: "2026-07-10",
    host: { userId: "u1", name: "Mantas" },
    address: "Some Street 1, Munich",
    eventTime: "19:00",
    attended: true,
    attendedVia: "played",
    rsvp: "yes",
    rsvpAuto: false,
    matchesPlayedByUser: 3,
    totalMatches: 4,
  };

  it("parses a happy-path payload", () => {
    const parsed = ProfileNightsResponseSchema.parse({ items: [night] });
    expect(parsed.items[0]?.attendedVia).toBe("played");
  });

  it("parses a hostless, unattended night", () => {
    const parsed = ProfileNightsResponseSchema.parse({
      items: [
        {
          ...night,
          host: null,
          address: null,
          eventTime: null,
          attended: false,
          attendedVia: null,
          rsvp: null,
          rsvpAuto: null,
          matchesPlayedByUser: 0,
        },
      ],
    });
    expect(parsed.items[0]?.attended).toBe(false);
  });

  it("rejects a malformed dateKey", () => {
    const r = ProfileNightsResponseSchema.safeParse({
      items: [{ ...night, dateKey: "10.07.2026" }],
    });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.path).toEqual(["items", 0, "dateKey"]);
  });
});
