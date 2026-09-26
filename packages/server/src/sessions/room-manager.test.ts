/**
 * `buildGameConfig` is the seam between the lobby and a game's START event.
 * For Quiztopia the seat list IS the table order, and the lobby's free-form
 * `config` must never be able to claim a different player count or seating
 * than the slots actually hold.
 */

import type { RoomSlot, RoomSlotKind } from "@boardgames/core/protocol";
import type { WSContext } from "hono/ws";
import { describe, expect, it } from "vitest";
import { buildGameConfig, type Room } from "./room-manager.ts";

function slot(kind: RoomSlotKind, i: number): RoomSlot {
  return kind === "human"
    ? { kind, playerName: `p${i}`, ready: true, connected: true }
    : { kind, ready: kind === "ai", connected: kind === "ai" };
}

function room(gameSlug: string, kinds: RoomSlotKind[], seatOrder?: number[]): Room {
  return {
    code: "ABCDEF",
    gameSlug,
    hostWs: {} as WSContext,
    slots: kinds.map(slot),
    clients: new Map(),
    slotUserIds: [],
    seatOrder: seatOrder ?? kinds.map((_, i) => i),
    sessionId: null,
  };
}

describe("buildGameConfig — quiztopia", () => {
  it("seats every human in slot order", () => {
    expect(buildGameConfig(room("quiztopia", ["human", "human", "human"]), {})).toEqual({
      playerCount: 3,
      seats: [0, 1, 2],
    });
  });

  it("skips open slots without renumbering the seats", () => {
    expect(buildGameConfig(room("quiztopia", ["human", "open", "human"]), {})).toEqual({
      playerCount: 2,
      seats: [0, 2],
    });
  });

  it("seats a single human as a solo table", () => {
    expect(buildGameConfig(room("quiztopia", ["human", "open", "open"]), {})).toEqual({
      playerCount: 1,
      seats: [0],
    });
  });

  it("maps slots through seatOrder and keeps the seats sorted", () => {
    const config = buildGameConfig(room("quiztopia", ["human", "human", "open"], [2, 0, 1]), {});
    expect(config).toEqual({ playerCount: 2, seats: [0, 2] });
  });

  it("passes the lobby's difficulty, expert flag, deck and language through", () => {
    const extra = { difficulty: 2, expert: true, deck: "extended", language: "de" };
    expect(buildGameConfig(room("quiztopia", ["human", "human"]), extra)).toEqual({
      ...extra,
      playerCount: 2,
      seats: [0, 1],
    });
  });

  it("does not let the lobby config override the count or the seating", () => {
    const hostile = { playerCount: 9999, seats: [5, 5, 5], difficulty: 1 };
    expect(buildGameConfig(room("quiztopia", ["human", "human"]), hostile)).toEqual({
      difficulty: 1,
      playerCount: 2,
      seats: [0, 1],
    });
  });
});

describe("buildGameConfig — other slugs keep their shape", () => {
  it("sushi-go counts humans and spreads extras after", () => {
    expect(buildGameConfig(room("sushi-go", ["human", "human", "open"]), { x: 1 })).toEqual({
      playerCount: 2,
      x: 1,
    });
  });

  it("an unknown slug returns the extras untouched", () => {
    expect(buildGameConfig(room("mystery", ["human"]), { a: 1 })).toEqual({ a: 1 });
  });
});

describe("buildGameConfig — the-hunger", () => {
  it("maps filled seats to strategies and lobby extras to options", () => {
    const r = room("the-hunger", ["human", "ai", "open", "human"]);
    expect(buildGameConfig(r, { mode: "rookie", beginnerSafeMountains: true })).toEqual({
      playerCount: 3,
      strategies: [null, "heuristic-v1", null],
      options: { mode: "rookie", beginnerSafeMountains: true },
    });
  });

  it("never lets extras override the seat count", () => {
    const r = room("the-hunger", ["human", "human"]);
    const config = buildGameConfig(r, { playerCount: 6, strategies: ["random"] });
    expect(config.playerCount).toBe(2);
    expect(config.strategies).toEqual([null, null]);
  });
});
