import { describe, expect, it } from "vitest";
import { GAME_MANIFESTS } from "../../games/manifests.ts";
import { ClientMessageSchema, MAX_SOLO_SEATS } from "./client-messages.ts";

describe("ClientMessageSchema", () => {
  it("accepts create-session and action", () => {
    expect(() =>
      ClientMessageSchema.parse({
        type: "create-session",
        gameSlug: "lost-cities",
        seats: [{ kind: "human" }, { kind: "ai", strategy: "ismcts-v4" }],
        config: {},
      }),
    ).not.toThrow();
    expect(() =>
      ClientMessageSchema.parse({
        type: "action",
        sessionId: "s-1",
        action: { type: "PLAYER_ACTION", action: { kind: "draw" } },
      }),
    ).not.toThrow();
  });

  it("accepts every room message", () => {
    expect(() =>
      ClientMessageSchema.parse({ type: "create-room", gameSlug: "set", playerName: "Alice" }),
    ).not.toThrow();
    expect(() =>
      ClientMessageSchema.parse({ type: "join-room", roomCode: "ABC", playerName: "Bob" }),
    ).not.toThrow();
    expect(() => ClientMessageSchema.parse({ type: "leave-room", roomCode: "ABC" })).not.toThrow();
    expect(() =>
      ClientMessageSchema.parse({
        type: "configure-room",
        roomCode: "ABC",
        slots: [{ kind: "human", ready: true, connected: true }],
      }),
    ).not.toThrow();
    expect(() =>
      ClientMessageSchema.parse({ type: "start-room", roomCode: "ABC", config: {} }),
    ).not.toThrow();
    expect(() =>
      ClientMessageSchema.parse({ type: "kick-player", roomCode: "ABC", slotIndex: 1 }),
    ).not.toThrow();
    expect(() =>
      ClientMessageSchema.parse({ type: "toggle-ready", roomCode: "ABC" }),
    ).not.toThrow();
    expect(() =>
      ClientMessageSchema.parse({ type: "swap-seats", roomCode: "ABC", a: 0, b: 1 }),
    ).not.toThrow();
    expect(() =>
      ClientMessageSchema.parse({ type: "shuffle-seats", roomCode: "ABC" }),
    ).not.toThrow();
  });

  it("rejects shuffle-seats without a room code", () => {
    expect(() => ClientMessageSchema.parse({ type: "shuffle-seats" })).toThrow();
  });

  it("parses rematch-room, rotation defaulting to none", () => {
    expect(ClientMessageSchema.parse({ type: "rematch-room", roomCode: "ABC" })).toEqual({
      type: "rematch-room",
      roomCode: "ABC",
      rotateBy: 0,
    });
    expect(
      ClientMessageSchema.parse({ type: "rematch-room", roomCode: "ABC", rotateBy: 2 }),
    ).toMatchObject({ rotateBy: 2 });
  });

  it("rejects rematch-room with a negative or fractional rotation", () => {
    expect(() =>
      ClientMessageSchema.parse({ type: "rematch-room", roomCode: "ABC", rotateBy: -1 }),
    ).toThrow();
    expect(() =>
      ClientMessageSchema.parse({ type: "rematch-room", roomCode: "ABC", rotateBy: 1.5 }),
    ).toThrow();
    expect(() => ClientMessageSchema.parse({ type: "rematch-room" })).toThrow();
  });

  it("rejects swap-seats with negative or missing slot indices", () => {
    expect(() =>
      ClientMessageSchema.parse({ type: "swap-seats", roomCode: "ABC", a: -1, b: 1 }),
    ).toThrow();
    expect(() =>
      ClientMessageSchema.parse({ type: "swap-seats", roomCode: "ABC", a: 0 }),
    ).toThrow();
  });

  it("rejects unknown discriminator", () => {
    expect(() => ClientMessageSchema.parse({ type: "not-a-real-message" })).toThrow();
  });

  it("accepts a liveness ping", () => {
    expect(() => ClientMessageSchema.parse({ type: "ping" })).not.toThrow();
  });

  it("rejects malformed gameSlug", () => {
    expect(() =>
      ClientMessageSchema.parse({
        type: "create-session",
        gameSlug: "Lost Cities",
        seats: [{ kind: "human" }],
        config: {},
      }),
    ).toThrow();
  });

  it("rejects an action outside the PLAYER_ACTION envelope", () => {
    expect(() =>
      ClientMessageSchema.parse({ type: "action", sessionId: "s-1", action: { kind: "draw" } }),
    ).toThrow();
    expect(() =>
      ClientMessageSchema.parse({
        type: "action",
        sessionId: "s-1",
        action: { type: "PLAYER_ACTION", action: {}, player: -1 },
      }),
    ).toThrow();
  });

  it("rejects a solo session with no seats, or an AI seat without a strategy", () => {
    const base = { type: "create-session", gameSlug: "durak", config: {} };
    expect(() => ClientMessageSchema.parse({ ...base, seats: [] })).toThrow();
    expect(() => ClientMessageSchema.parse({ ...base, seats: [{ kind: "ai" }] })).toThrow();
    expect(() => ClientMessageSchema.parse({ ...base })).toThrow();
  });
});

describe("create-session seats", () => {
  it("fit every game's largest table", () => {
    const largest = Math.max(...GAME_MANIFESTS.map((m) => m.seats.max));
    expect(MAX_SOLO_SEATS).toBeGreaterThanOrEqual(largest);
    const seats = Array.from({ length: largest }, () => ({ kind: "human" as const }));
    expect(
      ClientMessageSchema.safeParse({
        type: "create-session",
        gameSlug: "blood-on-the-clocktower",
        seats,
        config: {},
      }).success,
    ).toBe(true);
  });
});
