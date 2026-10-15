/**
 * Playing again at the same table: once a room's game is over the host can
 * start the next one at once — same people, AI and options — optionally
 * rotating the seats first (Codenames: each team's next operative becomes its
 * spymaster).
 */

import { roomSeating } from "@boardgames/core/protocol";
import type { WSContext } from "hono/ws";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../matches/store.ts", () => ({ saveMatch: async () => 1 }));

const { handleWsClose, handleWsMessage, wsAuth } = await import("./manager.ts");
const {
  handleConfigureRoom,
  handleCreateRoom,
  handleJoinRoom,
  handleRematchRoom,
  handleStartRoom,
  handleToggleReady,
  resetRoomsForTests,
  rotateSeats,
  rotatedFrom,
} = await import("./room-manager.ts");

interface FakeSocket {
  ws: WSContext;
  sent: { type: string; [key: string]: unknown }[];
}

function socket(userId: string): FakeSocket {
  const sent: FakeSocket["sent"] = [];
  const ws = {
    readyState: 1,
    send: (data: string) => sent.push(JSON.parse(data)),
  } as unknown as WSContext;
  wsAuth.set(ws, userId);
  return { ws, sent };
}

function last(s: FakeSocket, type: string) {
  return [...s.sent].reverse().find((m) => m.type === type);
}

type Slot = { kind: "human" | "ai" | "open"; ready: boolean; connected: boolean };

/** A started Connect 4 room: the host and a guest, or the host and an AI. */
function startedRoom(withGuest: boolean) {
  const host = socket("host-user");
  handleCreateRoom(host.ws, { gameSlug: "connect-4", playerName: "Host" });
  const code = last(host, "room-created")?.roomCode as string;
  const guest = socket("guest-user");
  if (withGuest) {
    handleJoinRoom(guest.ws, { roomCode: code, playerName: "Guest" });
    handleToggleReady(guest.ws, { roomCode: code });
  } else {
    const slots = (last(host, "room-created")?.roomState as { slots: Slot[] }).slots;
    handleConfigureRoom(host.ws, {
      roomCode: code,
      slots: slots.map((s, i) =>
        i === 1 ? { kind: "ai", aiStrategy: "blocker", ready: true, connected: false } : s,
      ),
    });
  }
  handleStartRoom(host.ws, { roomCode: code, config: { rows: 6, columns: 7 } });
  const started = last(host, "game-started");
  expect(started).toBeDefined();
  return { host, guest, code, sessionId: started?.sessionId as string };
}

function resign(s: FakeSocket, sessionId: string): void {
  handleWsMessage(s.ws, {
    type: "action",
    sessionId,
    action: { type: "PLAYER_ACTION", action: { type: "resign" } },
  });
}

afterEach(() => {
  resetRoomsForTests();
});

describe("room rematch", () => {
  it("starts a fresh game at the same table once the game is over", () => {
    const { host, code, sessionId } = startedRoom(false);
    handleRematchRoom(host.ws, { roomCode: code, rotateBy: 0 });
    expect(last(host, "error")?.message).toMatch(/Finish this game/);

    resign(host, sessionId);
    host.sent.length = 0;
    handleRematchRoom(host.ws, { roomCode: code, rotateBy: 0 });
    const next = last(host, "game-started");
    expect(next).toBeDefined();
    expect(next?.sessionId).not.toBe(sessionId);
    expect(last(host, "error")).toBeUndefined();
  });

  it("is the host's call, and needs everyone who played", () => {
    const { host, guest, code, sessionId } = startedRoom(true);
    resign(host, sessionId);
    handleRematchRoom(guest.ws, { roomCode: code, rotateBy: 0 });
    expect(last(guest, "error")?.message).toMatch(/Only the host/);

    handleWsClose(guest.ws);
    handleRematchRoom(host.ws, { roomCode: code, rotateBy: 0 });
    expect(last(host, "error")?.message).toMatch(/Guest left the table/);
  });

  it("rotates the seats when asked: both people are dealt into the new game, swapped", () => {
    const { host, guest, code, sessionId } = startedRoom(true);
    const before = last(host, "game-started")?.playerIndex;
    resign(host, sessionId);
    handleRematchRoom(host.ws, { roomCode: code, rotateBy: 1 });
    expect(last(host, "game-started")?.playerIndex).toBe(1 - (before as number));
    expect(last(guest, "game-started")?.playerIndex).toBe(before);
  });
});

describe("rotateSeats", () => {
  const slots = (kinds: Slot["kind"][]) =>
    kinds.map((kind) => ({ kind, ready: true, connected: true }));

  it("moves each filled seat `by` places down, keeping the ranks a permutation", () => {
    const room = { slots: slots(["human", "ai", "human", "open", "ai", "human"]), seatOrder: [] };
    room.seatOrder = [0, 1, 2, 3, 4, 5] as never;
    const before = roomSeating(room.slots, room.seatOrder);
    rotateSeats(room, 2);
    const after = roomSeating(room.slots, room.seatOrder);
    expect(after).toEqual(before.map((_, s) => before[rotatedFrom(s, 2, before.length)]));
    expect([...room.seatOrder].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("keeps seats two apart together, so an odd Codenames table keeps its teams", () => {
    // Five seats: Red 0, 2, 4 and Blue 1, 3. Each team's next player clues.
    expect([0, 1, 2, 3, 4].map((s) => rotatedFrom(s, 2, 5))).toEqual([2, 3, 4, 1, 0]);
    // Four seats: the ordinary shift.
    expect([0, 1, 2, 3].map((s) => rotatedFrom(s, 2, 4))).toEqual([2, 3, 0, 1]);
    // Two seats, by one: a swap.
    expect([0, 1].map((s) => rotatedFrom(s, 1, 2))).toEqual([1, 0]);
  });

  it("leaves the order alone for a full turn of the table", () => {
    const room = { slots: slots(["human", "ai"]), seatOrder: [0, 1] };
    rotateSeats(room, 2);
    expect(room.seatOrder).toEqual([0, 1]);
  });
});
