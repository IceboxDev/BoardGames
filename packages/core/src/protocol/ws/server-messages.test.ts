import { describe, expect, it } from "vitest";
import { ServerMessageSchema } from "./server-messages.ts";

describe("ServerMessageSchema", () => {
  it("accepts session-created", () => {
    expect(() =>
      ServerMessageSchema.parse({
        type: "session-created",
        sessionId: "s-1",
        playerView: { hand: [] },
        legalActions: [],
        phase: "active",
      }),
    ).not.toThrow();
  });

  it("accepts state-update with optional playerIndex", () => {
    expect(() =>
      ServerMessageSchema.parse({
        type: "state-update",
        sessionId: "s-1",
        playerView: {},
        legalActions: [],
        activePlayer: 0,
        playerIndex: 1,
        phase: "active",
      }),
    ).not.toThrow();
    expect(() =>
      ServerMessageSchema.parse({
        type: "state-update",
        sessionId: "s-1",
        playerView: {},
        legalActions: [],
        activePlayer: 0,
        phase: "active",
      }),
    ).not.toThrow();
  });

  it("accepts every documented type", () => {
    const sample = (type: string, extra: object) => ServerMessageSchema.parse({ type, ...extra });
    expect(() => sample("ai-thinking", { sessionId: "s-1" })).not.toThrow();
    expect(() =>
      sample("game-over", { sessionId: "s-1", result: {}, playerView: {} }),
    ).not.toThrow();
    expect(() => sample("error", { message: "boom" })).not.toThrow();
    expect(() =>
      sample("room-created", {
        roomCode: "ABC",
        roomState: { gameSlug: "set", hostName: "x", slots: [] },
      }),
    ).not.toThrow();
    expect(() =>
      sample("room-joined", {
        roomCode: "ABC",
        roomState: { gameSlug: "set", hostName: "x", slots: [] },
        yourSlot: 0,
      }),
    ).not.toThrow();
    expect(() =>
      sample("game-started", {
        roomCode: "ABC",
        sessionId: "s-1",
        playerIndex: 0,
        activePlayer: 0,
        playerView: {},
        legalActions: [],
        phase: "active",
      }),
    ).not.toThrow();
  });

  it("rejects unknown discriminator", () => {
    expect(() => ServerMessageSchema.parse({ type: "nope", sessionId: "s-1" })).toThrow();
  });

  it("rejects missing required fields", () => {
    expect(() =>
      ServerMessageSchema.parse({ type: "session-created", sessionId: "s-1" }),
    ).toThrow();
  });
});
