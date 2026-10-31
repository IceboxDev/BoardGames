import type { MatchRecord } from "@boardgames/core/history/types";
import { type CalendarLocks, LockedDateSchema } from "@boardgames/core/protocol";
import { describe, expect, it } from "vitest";
import {
  campaignSessions,
  matchChip,
  missionOfMatch,
  missionsOf,
  nextMission,
  summaryLine,
} from "./campaign-sessions";

const BB = "bomb-busters";

function lock(over: Record<string, unknown> = {}) {
  return LockedDateSchema.parse({
    lockedBy: "admin",
    lockedAt: "2026-10-01 10:00:00",
    expectedUserIds: [],
    rsvps: { a: "yes", b: "yes", c: "no" },
    host: { userId: "a", name: "Ana Host" },
    eventTime: "18:15",
    address: null,
    picksLockedAt: "2026-10-01 10:00:00",
    attendance: { definite: 2, tentative: 0 },
    topGameSlug: BB,
    ...over,
  });
}

let nextId = 1;
function match(dateKey: string, scenario: string, outcome: "win" | "loss", sortOrder = 0) {
  return {
    id: nextId++,
    dateKey,
    playedAt: `${dateKey}T18:00:00.000Z`,
    gameSlug: BB,
    gameTitle: "Bomb Busters",
    outcome: {
      kind: "coop",
      participants: [{ userId: "a", displayName: "Ana" }],
      outcome,
      scenario,
    },
    notes: null,
    recordedBy: "admin",
    recordedAt: "2026-10-01 10:00:00",
    updatedAt: null,
    sortOrder,
  } as MatchRecord;
}

const locks: CalendarLocks = {
  "2026-10-02": lock(),
  "2026-10-09": lock({ topGameSlug: "azul" }),
  "2026-10-16": lock({ picksLockedAt: null }), // still voting: not a campaign night yet
  "2026-10-23": lock({ isPrivate: true, seatedUserIds: ["a", "b", "d"] }),
  "2026-10-30": lock({ fixedGameSlug: BB }),
  "2026-11-06": lock({ redacted: true }),
};

describe("campaignSessions", () => {
  it("numbers this campaign's sealed nights and splits past / tonight / upcoming", () => {
    const s = campaignSessions(BB, locks, "2026-10-23", []);
    expect(s.map((x) => [x.nightKey, x.n, x.when])).toEqual([
      ["2026-10-02", 1, "past"],
      ["2026-10-23", 2, "tonight"],
      ["2026-10-30", 3, "upcoming"],
    ]);
    expect(s[0]?.partyIds).toEqual(["a", "b"]);
    // A private night's party is its seated guests, not the RSVP list.
    expect(s[1]?.partyIds).toEqual(["a", "b", "d"]);
    expect(s[1]?.hostName).toBe("Ana Host");
  });

  it("always includes the current night and attaches its matches in play order", () => {
    const m1 = match("2026-10-02", "#1 Training, Day 1", "win", 2);
    const m2 = match("2026-10-02", "#2 Training, Day 2", "loss", 1);
    const s = campaignSessions(BB, { "2026-10-02": lock() }, "2026-10-02", [m1, m2]);
    expect(s).toHaveLength(1);
    expect(s[0]?.matches.map((m) => m.id)).toEqual([m2.id, m1.id]);
  });
});

describe("missions", () => {
  it("parses Bomb Busters' numbered missions, none for unnumbered games", () => {
    expect(missionsOf(BB)[0]).toEqual({ n: 1, label: "Training, Day 1" });
    expect(missionsOf("dungeons-and-dragons")).toEqual([]);
  });

  it("chips a match by mission and result", () => {
    const won = match("2026-10-02", "#3 Training, Day 3", "win");
    expect(missionOfMatch(won)).toBe(3);
    expect(matchChip(won)).toMatchObject({ label: "#3 ✓", tone: "won" });
    expect(matchChip(match("2026-10-02", "#3 Training, Day 3", "loss"))).toMatchObject({
      label: "#3 ✗",
      tone: "lost",
    });
  });

  it("counts cleared missions in the summary and names the next one", () => {
    const ms = [
      match("2026-10-02", "#1 Training, Day 1", "win"),
      match("2026-10-02", "#2 Training, Day 2", "loss"),
    ];
    const s = campaignSessions(BB, locks, "2026-10-23", ms);
    const total = missionsOf(BB).length;
    expect(summaryLine(BB, s, (k) => k)).toBe(
      `Session 2 · 1 of ${total} missions cleared · since 2026-10-02`,
    );
    expect(nextMission(BB, s)?.n).toBe(2);
  });

  it("says the campaign starts tonight on its first session", () => {
    const s = campaignSessions(BB, { "2026-10-02": lock() }, "2026-10-02", []);
    expect(summaryLine(BB, s, (k) => k)).toBe("Session 1 — the campaign starts tonight");
  });
});
