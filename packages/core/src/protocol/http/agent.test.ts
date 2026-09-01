import { describe, expect, it } from "vitest";
import { AgentInactivityResponseSchema, AgentWhoamiResponseSchema } from "./agent.ts";

describe("AgentWhoamiResponseSchema", () => {
  it("accepts a verified uid and rejects an empty one", () => {
    expect(() =>
      AgentWhoamiResponseSchema.parse({ uid: "agent-694f77bd2067c8f21866f81a" }),
    ).not.toThrow();
    expect(() => AgentWhoamiResponseSchema.parse({ uid: "" })).toThrow();
    expect(() => AgentWhoamiResponseSchema.parse({})).toThrow();
  });
});

describe("AgentInactivityResponseSchema", () => {
  const member = {
    userId: "u1",
    name: "Linda",
    role: "user",
    coverage: { can: 0, maybe: 0, total: 41 },
    latestMarkedDay: null,
    lastPlayedDay: "2026-05-15",
    zeroDays: 119,
    inactive: true,
  };
  const good = {
    generatedAt: "2026-09-01T12:00:00.000Z",
    todayKey: "2026-09-01",
    windowEndKey: "2026-10-11",
    inactiveAfterDays: 14,
    members: [member],
  };

  it("accepts a full snapshot, empty member list included", () => {
    expect(() => AgentInactivityResponseSchema.parse(good)).not.toThrow();
    expect(() => AgentInactivityResponseSchema.parse({ ...good, members: [] })).not.toThrow();
  });

  it("rejects a malformed date key and a negative clock", () => {
    expect(() => AgentInactivityResponseSchema.parse({ ...good, todayKey: "2026-9-1" })).toThrow();
    expect(() =>
      AgentInactivityResponseSchema.parse({
        ...good,
        members: [{ ...member, zeroDays: -1 }],
      }),
    ).toThrow();
  });
});
