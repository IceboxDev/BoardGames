/**
 * Lobby seat picking: the host moves anyone; a guest may take a seat a bot
 * holds (Codenames: claim the Blue spymaster); the host may shuffle the
 * filled seats. Only `seatOrder` ever changes.
 */

import type { RoomState } from "@boardgames/core/protocol";
import { roomSeating } from "@boardgames/core/protocol";
import type { WSContext } from "hono/ws";
import { afterEach, describe, expect, it } from "vitest";
import { wsAuth } from "./manager.ts";
import {
  handleConfigureRoom,
  handleCreateRoom,
  handleJoinRoom,
  handleShuffleSeats,
  handleSwapSeats,
  resetRoomsForTests,
} from "./room-manager.ts";

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

function roomState(s: FakeSocket): RoomState {
  const msg = last(s, "room-updated") ?? last(s, "room-joined") ?? last(s, "room-created");
  return msg?.roomState as RoomState;
}

/** A Codenames room: host (slot 0), guest (slot 1), two AIs (slots 2–3). */
function codenamesRoom() {
  const host = socket("host-user");
  handleCreateRoom(host.ws, { gameSlug: "codenames", playerName: "Host" });
  const code = last(host, "room-created")?.roomCode as string;
  const guest = socket("guest-user");
  handleJoinRoom(guest.ws, { roomCode: code, playerName: "Guest" });
  const slots = roomState(host).slots.map((s, i) =>
    i === 2 || i === 3 ? { kind: "ai" as const, ready: true, connected: false } : s,
  );
  handleConfigureRoom(host.ws, { roomCode: code, slots });
  return { host, guest, code };
}

afterEach(() => {
  resetRoomsForTests();
});

describe("lobby seat picking", () => {
  it("lets a guest take a seat a bot holds", () => {
    const { host, guest, code } = codenamesRoom();
    // Guest (slot 1, Blue Spymaster) takes slot 2's seat (Red Operative).
    handleSwapSeats(guest.ws, { roomCode: code, a: 1, b: 2 });
    expect(last(guest, "error")).toBeUndefined();
    const state = roomState(host);
    expect(roomSeating(state.slots, state.seatOrder)).toEqual([0, 2, 1, 3]);
  });

  it("doesn't let a guest move another person", () => {
    const { guest, code } = codenamesRoom();
    handleSwapSeats(guest.ws, { roomCode: code, a: 0, b: 1 });
    expect(last(guest, "error")?.message).toMatch(/host/);
    handleSwapSeats(guest.ws, { roomCode: code, a: 2, b: 3 });
    expect(last(guest, "error")?.message).toMatch(/host/);
  });

  it("lets the host shuffle only the filled seats", () => {
    const { host, guest, code } = codenamesRoom();
    handleShuffleSeats(guest.ws, { roomCode: code });
    expect(last(guest, "error")?.message).toMatch(/host/);
    handleShuffleSeats(host.ws, { roomCode: code });
    const state = roomState(host);
    const seating = roomSeating(state.slots, state.seatOrder);
    expect([...seating].sort()).toEqual([0, 1, 2, 3]);
    // Open slots keep their ranks at the end.
    expect(state.seatOrder?.slice(4)).toEqual([4, 5, 6, 7]);
  });
});
