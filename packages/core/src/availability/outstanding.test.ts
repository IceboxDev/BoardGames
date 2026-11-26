import { describe, expect, it } from "vitest";
import { type NightOutstandingInput, nightOutstanding, sortOutstanding } from "./outstanding.ts";

const base: NightOutstandingInput = {
  dateKey: "2026-11-29",
  title: null,
  isPrivate: false,
  hostUserId: "host",
  eventTime: "18:00",
  address: "Main St 1",
  expectedUserIds: [],
  definite: [],
  tentative: [],
  invitedNoAnswer: [],
  voters: new Set(),
  voting: false,
  exitAttendees: null,
  answeredByHand: new Set(),
  saidNo: new Set(),
  hyped: new Set(),
  staleVotes: new Map(),
  exitVoted: new Set(),
};

const kinds = (m: Map<string, { kind: string }[]>, id: string) =>
  (m.get(id) ?? []).map((i) => i.kind);

describe("nightOutstanding", () => {
  it("asks an open night's unconfirmed and maybe people to RSVP, not the host or those who answered", () => {
    const out = nightOutstanding({
      ...base,
      expectedUserIds: ["gone"],
      definite: ["host", "auto", "manual"],
      tentative: ["maybe", "no"],
      answeredByHand: new Set(["manual", "no"]),
      saidNo: new Set(["no"]),
    });
    expect(out.get("auto")).toEqual([
      { kind: "rsvp", dateKey: "2026-11-29", title: null, reason: "unconfirmed" },
    ]);
    expect(out.get("maybe")?.[0]).toMatchObject({ kind: "rsvp", reason: "maybe" });
    expect(out.get("gone")?.[0]).toMatchObject({ kind: "rsvp", reason: "unconfirmed" });
    expect(out.has("host")).toBe(false);
    expect(out.has("manual")).toBe(false);
    expect(out.has("no")).toBe(false);
  });

  it("asks a private night's silent invitees, nobody else", () => {
    const out = nightOutstanding({
      ...base,
      isPrivate: true,
      title: "TI4",
      definite: ["host", "seated"],
      invitedNoAnswer: ["silent"],
    });
    expect(out.get("silent")).toEqual([{ kind: "invite", dateKey: "2026-11-29", title: "TI4" }]);
    expect(out.has("seated")).toBe(false);
  });

  it("wants a hype from every voter while the night votes; teach alone doesn't count", () => {
    const night = {
      ...base,
      definite: ["host", "a", "b"],
      answeredByHand: new Set(["a", "b"]),
      voters: new Set(["host", "a", "b"]),
      hyped: new Set(["host", "a"]),
      staleVotes: new Map([["a", 2]]),
    };
    const out = nightOutstanding({ ...night, voting: true });
    expect(kinds(out, "b")).toEqual(["vote"]);
    expect(out.get("a")).toEqual([
      { kind: "stale-votes", dateKey: "2026-11-29", title: null, count: 2 },
    ]);
    expect(nightOutstanding({ ...night, voting: false }).size).toBe(0);
  });

  it("wants an EXIT box from every attendee who hasn't picked one", () => {
    const out = nightOutstanding({
      ...base,
      exitAttendees: ["host", "a"],
      exitVoted: new Set(["host"]),
    });
    expect(kinds(out, "a")).toEqual(["exit-vote"]);
    expect(out.has("host")).toBe(false);
  });

  it("tells the host what the night is missing", () => {
    const out = nightOutstanding({ ...base, eventTime: null, address: "  " });
    expect(out.get("host")).toEqual([
      { kind: "host-details", dateKey: "2026-11-29", title: null, missing: ["time", "address"] },
    ]);
  });
});

describe("sortOutstanding", () => {
  it("orders by night, then urgency, then the nightless items", () => {
    const sorted = sortOutstanding([
      { kind: "collection" },
      { kind: "vote", dateKey: "2026-11-29", title: null },
      { kind: "rsvp", dateKey: "2026-12-05", title: null, reason: "maybe" },
      { kind: "rsvp", dateKey: "2026-11-29", title: null, reason: "unconfirmed" },
      { kind: "purchase-vote", pollId: 1, title: null, votesLeft: 3, votesTotal: 3 },
    ]);
    expect(sorted.map((i) => ("dateKey" in i ? `${i.kind}@${i.dateKey}` : i.kind))).toEqual([
      "rsvp@2026-11-29",
      "vote@2026-11-29",
      "rsvp@2026-12-05",
      "purchase-vote",
      "collection",
    ]);
  });
});
