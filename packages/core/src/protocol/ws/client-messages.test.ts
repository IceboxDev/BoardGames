import { describe, expect, it } from "vitest";
import { ClientMessageSchema } from "./client-messages.ts";

describe("ClientMessageSchema", () => {
  it("accepts create-session and action", () => {
    expect(() =>
      ClientMessageSchema.parse({ type: "create-session", gameSlug: "lost-cities", config: {} }),
    ).not.toThrow();
    expect(() =>
      ClientMessageSchema.parse({ type: "action", sessionId: "s-1", action: { kind: "draw" } }),
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
  });

  it("rejects unknown discriminator", () => {
    expect(() => ClientMessageSchema.parse({ type: "ping" })).toThrow();
  });

  it("rejects malformed gameSlug", () => {
    expect(() =>
      ClientMessageSchema.parse({ type: "create-session", gameSlug: "Lost Cities", config: {} }),
    ).toThrow();
  });
});
