/**
 * A room seat carries its holder's profile picture: the server looks it up
 * from the seat's account once the seat is taken, and again when they return.
 */

import type { RoomState } from "@boardgames/core/protocol";
import type { WSContext } from "hono/ws";
import { afterEach, describe, expect, it, vi } from "vitest";
import { wsAuth } from "./manager.ts";
import {
  handleCreateRoom,
  handleJoinRoom,
  handleKickPlayer,
  handleLeaveRoom,
  resetRoomsForTests,
} from "./room-manager.ts";

const pictures = new Map<string, string | null>([
  ["host-user", "/api/avatars/host-user?v=aaaaaaaaaaaa"],
  ["guest-user", null],
]);
vi.mock("../lib/player-avatars.ts", () => ({
  playerAvatarUrl: async (userId: string) => pictures.get(userId) ?? null,
}));

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

function roomState(s: FakeSocket): RoomState {
  const msg = [...s.sent]
    .reverse()
    .find(
      (m) => m.type === "room-updated" || m.type === "room-joined" || m.type === "room-created",
    );
  return msg?.roomState as RoomState;
}

/** Let the lookups settle. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  resetRoomsForTests();
});

describe("room seat pictures", () => {
  it("puts each person's picture on their seat, and none on a seat without one", async () => {
    const host = socket("host-user");
    handleCreateRoom(host.ws, { gameSlug: "codenames", playerName: "Host" });
    const code = host.sent[0]?.roomCode as string;
    const guest = socket("guest-user");
    handleJoinRoom(guest.ws, { roomCode: code, playerName: "Guest" });
    await settle();

    const slots = roomState(guest).slots;
    expect(slots[0]?.avatarUrl).toBe("/api/avatars/host-user?v=aaaaaaaaaaaa");
    expect(slots[1]?.kind).toBe("human");
    expect(slots[1]?.avatarUrl).toBeUndefined();
  });

  it("re-reads the picture when a person comes back, and drops it with the seat", async () => {
    const host = socket("host-user");
    handleCreateRoom(host.ws, { gameSlug: "codenames", playerName: "Host" });
    const code = host.sent[0]?.roomCode as string;
    const guest = socket("guest-user");
    handleJoinRoom(guest.ws, { roomCode: code, playerName: "Guest" });
    await settle();

    // A new avatar shows when they next take the seat.
    pictures.set("guest-user", "/api/avatars/guest-user?v=bbbbbbbbbbbb");
    handleLeaveRoom(guest.ws, { roomCode: code });
    const back = socket("guest-user");
    handleJoinRoom(back.ws, { roomCode: code, playerName: "Guest" });
    await settle();
    expect(roomState(host).slots[1]?.avatarUrl).toBe("/api/avatars/guest-user?v=bbbbbbbbbbbb");

    handleKickPlayer(host.ws, { roomCode: code, slotIndex: 1 });
    expect(roomState(host).slots[1]).toEqual({ kind: "open", ready: false, connected: false });
  });

  it("never gives a lookup's picture to whoever holds the seat by the time it lands", async () => {
    const host = socket("host-user");
    handleCreateRoom(host.ws, { gameSlug: "codenames", playerName: "Host" });
    const code = host.sent[0]?.roomCode as string;
    pictures.set("guest-user", "/api/avatars/guest-user?v=cccccccccccc");
    const guest = socket("guest-user");
    handleJoinRoom(guest.ws, { roomCode: code, playerName: "Guest" });
    handleLeaveRoom(guest.ws, { roomCode: code }); // before the lookup returns
    const other = socket("other-user");
    handleJoinRoom(other.ws, { roomCode: code, playerName: "Other" });
    await settle();
    expect(roomState(host).slots[1]).toMatchObject({ playerName: "Other" });
    expect(roomState(host).slots[1]?.avatarUrl).toBeUndefined();
  });
});
