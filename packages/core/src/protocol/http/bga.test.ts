import { describe, expect, it } from "vitest";
import {
  BgaSessionSchema,
  BgaStreamEventSchema,
  CreateBgaSessionRequestSchema,
  CreateBgaSessionResponseSchema,
  IngestBgaEventsRequestSchema,
  IngestBgaEventsResponseSchema,
} from "./bga";

const session = {
  id: "b3f1c9e2",
  code: "K7XMPQ",
  game: "7-wonders",
  createdAt: "2026-07-10T12:00:00.000Z",
};

const event = { seq: 0, kind: "gamedatas", payload: { players: {} }, ts: 1720612800000 };
const token = "a".repeat(32);

describe("BgaSessionSchema", () => {
  it("parses a valid session", () => {
    expect(() => BgaSessionSchema.parse(session)).not.toThrow();
  });

  it("rejects an unsupported game", () => {
    const result = BgaSessionSchema.safeParse({ ...session, game: "chess" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["game"]);
  });
});

describe("CreateBgaSessionRequest/Response", () => {
  it("parses a valid round trip", () => {
    expect(() => CreateBgaSessionRequestSchema.parse({ game: "7-wonders" })).not.toThrow();
    expect(() =>
      CreateBgaSessionResponseSchema.parse({ session, ingestToken: token }),
    ).not.toThrow();
  });

  it("rejects a too-short ingest token", () => {
    const result = CreateBgaSessionResponseSchema.safeParse({ session, ingestToken: "short" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["ingestToken"]);
  });
});

describe("IngestBgaEventsRequestSchema", () => {
  it("parses a valid batch", () => {
    expect(() => IngestBgaEventsRequestSchema.parse({ token, events: [event] })).not.toThrow();
  });

  it("rejects a missing token", () => {
    const result = IngestBgaEventsRequestSchema.safeParse({ events: [event] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].path).toEqual(["token"]);
  });

  it("rejects an empty batch and an oversized batch", () => {
    expect(IngestBgaEventsRequestSchema.safeParse({ token, events: [] }).success).toBe(false);
    const events = Array.from({ length: 51 }, (_, i) => ({ ...event, seq: i }));
    expect(IngestBgaEventsRequestSchema.safeParse({ token, events }).success).toBe(false);
  });

  it("rejects a negative seq and an unknown kind", () => {
    expect(
      IngestBgaEventsRequestSchema.safeParse({ token, events: [{ ...event, seq: -1 }] }).success,
    ).toBe(false);
    expect(
      IngestBgaEventsRequestSchema.safeParse({ token, events: [{ ...event, kind: "bogus" }] })
        .success,
    ).toBe(false);
  });
});

describe("IngestBgaEventsResponseSchema", () => {
  it("parses and requires ok: true", () => {
    expect(() =>
      IngestBgaEventsResponseSchema.parse({ ok: true, accepted: 3, nextSeq: 12 }),
    ).not.toThrow();
    expect(
      IngestBgaEventsResponseSchema.safeParse({ ok: false, accepted: 3, nextSeq: 12 }).success,
    ).toBe(false);
  });
});

describe("BgaStreamEventSchema", () => {
  it("parses both frame kinds", () => {
    expect(() =>
      BgaStreamEventSchema.parse({ type: "connected", session, lastSeq: 5 }),
    ).not.toThrow();
    expect(() => BgaStreamEventSchema.parse({ type: "event", event })).not.toThrow();
  });

  it("rejects an unknown frame type", () => {
    expect(BgaStreamEventSchema.safeParse({ type: "mystery" }).success).toBe(false);
  });
});
