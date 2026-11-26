import { describe, expect, it } from "vitest";
import {
  AdminMemberNoteSchema,
  AdminOutstandingResponseSchema,
  CreateMemberNoteBodySchema,
  MEMBER_NOTE_MAX,
  OutstandingItemSchema,
  UpdateMemberNoteBodySchema,
} from "./admin-outstanding.ts";

describe("OutstandingItemSchema", () => {
  it("parses every kind", () => {
    const items = [
      { kind: "rsvp", dateKey: "2026-11-29", title: null, reason: "unconfirmed" },
      { kind: "invite", dateKey: "2026-12-05_2", title: "TI4" },
      { kind: "vote", dateKey: "2026-11-29", title: null },
      { kind: "stale-votes", dateKey: "2026-11-29", title: null, count: 2 },
      { kind: "exit-vote", dateKey: "2026-11-29", title: null },
      { kind: "purchase-vote", pollId: 3, title: null, votesLeft: 2, votesTotal: 3 },
      { kind: "host-details", dateKey: "2026-11-29", title: null, missing: ["time"] },
      { kind: "collection" },
    ];
    for (const item of items) expect(OutstandingItemSchema.parse(item)).toEqual(item);
  });

  it("rejects an unknown kind and a bad night key", () => {
    expect(() => OutstandingItemSchema.parse({ kind: "quiz" })).toThrow();
    const res = OutstandingItemSchema.safeParse({ kind: "vote", dateKey: "29.11.", title: null });
    expect(res.error?.issues[0]?.path).toEqual(["dateKey"]);
  });

  it("rejects host details with nothing missing", () => {
    expect(() =>
      OutstandingItemSchema.parse({
        kind: "host-details",
        dateKey: "2026-11-29",
        title: null,
        missing: [],
      }),
    ).toThrow();
  });
});

describe("AdminOutstandingResponseSchema", () => {
  it("parses a member map", () => {
    const body = { members: { u1: { items: [{ kind: "collection" }], openNotes: 1 } } };
    expect(AdminOutstandingResponseSchema.parse(body)).toEqual(body);
  });

  it("rejects a negative note count", () => {
    const res = AdminOutstandingResponseSchema.safeParse({
      members: { u1: { items: [], openNotes: -1 } },
    });
    expect(res.error?.issues[0]?.path).toEqual(["members", "u1", "openNotes"]);
  });
});

describe("member notes", () => {
  it("trims and bounds the text", () => {
    expect(CreateMemberNoteBodySchema.parse({ text: "  owes 5€  " })).toEqual({ text: "owes 5€" });
    expect(() => CreateMemberNoteBodySchema.parse({ text: "   " })).toThrow();
    expect(() =>
      CreateMemberNoteBodySchema.parse({ text: "x".repeat(MEMBER_NOTE_MAX + 1) }),
    ).toThrow();
  });

  it("needs something to update", () => {
    expect(UpdateMemberNoteBodySchema.parse({ done: true })).toEqual({ done: true });
    expect(() => UpdateMemberNoteBodySchema.parse({})).toThrow();
  });

  it("parses a note", () => {
    const note = {
      id: 1,
      text: "t",
      doneAt: null,
      createdAt: "2026-11-23 10:00:00",
      createdByName: null,
    };
    expect(AdminMemberNoteSchema.parse(note)).toEqual(note);
  });
});
