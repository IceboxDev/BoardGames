/**
 * A started room outlives a dropped connection: everyone can refresh, lose
 * signal or lock their phone and come back to the same game within the grace
 * period; only after it does the room close and the game end.
 */

import type { WSContext } from "hono/ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleWsClose, handleWsMessage, wsAuth } from "./manager.ts";
import {
  handleChat,
  handleConfigureRoom,
  handleCreateRoom,
  handleJoinRoom,
  handleStartRoom,
  handleToggleReady,
  LOBBY_RECONNECT_GRACE_MS,
  ROOM_RECONNECT_GRACE_MS,
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

/** A started Durak room: the host plus one AI. */
function startedRoom(): { host: FakeSocket; code: string } {
  const host = socket("host-user");
  handleCreateRoom(host.ws, { gameSlug: "durak", playerName: "Host" });
  const code = last(host, "room-created")?.roomCode as string;
  const slots = (last(host, "room-created")?.roomState as { slots: unknown[] }).slots;
  handleConfigureRoom(host.ws, {
    roomCode: code,
    slots: slots.map((s, i) =>
      i === 1
        ? { kind: "ai", aiStrategy: "random", ready: true, connected: false }
        : (s as { kind: "human" | "ai" | "open"; ready: boolean; connected: boolean }),
    ),
  });
  handleStartRoom(host.ws, { roomCode: code, config: {} });
  expect(last(host, "game-started")).toBeDefined();
  return { host, code };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  resetRoomsForTests();
  vi.useRealTimers();
});

describe("room reconnect grace", () => {
  it("lets the last person back into the same game within the grace period", () => {
    const { host, code } = startedRoom();
    const sessionId = last(host, "game-started")?.sessionId;

    handleWsClose(host.ws);
    vi.advanceTimersByTime(ROOM_RECONNECT_GRACE_MS - 1_000);

    const back = socket("host-user");
    handleJoinRoom(back.ws, { roomCode: code, playerName: "Host" });
    const state = last(back, "state-update") ?? last(back, "game-over");
    expect(state?.sessionId).toBe(sessionId);

    // Reconnecting disarmed the timer: the room is still there long after.
    vi.advanceTimersByTime(ROOM_RECONNECT_GRACE_MS * 2);
    const again = socket("host-user");
    handleWsClose(back.ws);
    handleJoinRoom(again.ws, { roomCode: code, playerName: "Host" });
    expect(last(again, "error")).toBeUndefined();
  });

  it("closes the room once the grace period passes with nobody back", () => {
    const { host, code } = startedRoom();
    handleWsClose(host.ws);
    vi.advanceTimersByTime(ROOM_RECONNECT_GRACE_MS + 1_000);

    const late = socket("host-user");
    handleJoinRoom(late.ws, { roomCode: code, playerName: "Host" });
    expect(last(late, "error")?.message).toBe(`Room ${code} not found`);
  });

  it("never seats a stranger in a disconnected player's place", () => {
    const { host, code } = startedRoom();
    handleWsClose(host.ws);
    const stranger = socket("someone-else");
    handleJoinRoom(stranger.ws, { roomCode: code, playerName: "Host" });
    expect(last(stranger, "error")?.message).toMatch(/no seat in this game belongs to you/);
  });
});

/** A started Durak room with two people: the host and a guest. */
function startedTwoPersonRoom(): { host: FakeSocket; guest: FakeSocket; code: string } {
  const host = socket("host-user");
  handleCreateRoom(host.ws, { gameSlug: "durak", playerName: "Host" });
  const code = last(host, "room-created")?.roomCode as string;
  const guest = socket("guest-user");
  handleJoinRoom(guest.ws, { roomCode: code, playerName: "Guest" });
  handleToggleReady(guest.ws, { roomCode: code });
  handleStartRoom(host.ws, { roomCode: code, config: {} });
  expect(last(guest, "game-started")).toBeDefined();
  return { host, guest, code };
}

describe("leaving a started room game", () => {
  it("leaves the seat for one person without ending the game for the table", () => {
    const { host, guest, code } = startedTwoPersonRoom();
    const sessionId = last(guest, "game-started")?.sessionId as string;

    handleWsMessage(guest.ws, { type: "leave-session", sessionId });

    expect(last(host, "room-closed")).toBeUndefined();
    expect(last(host, "player-disconnected")?.playerName).toBe("Guest");

    // The guest can come back to the same game.
    const back = socket("guest-user");
    handleJoinRoom(back.ws, { roomCode: code, playerName: "Guest" });
    expect((last(back, "state-update") ?? last(back, "game-over"))?.sessionId).toBe(sessionId);
  });

  it("re-sends the room identity on a mid-game reconnect, and the host keeps host powers", () => {
    const { host, code } = startedTwoPersonRoom();
    handleWsClose(host.ws);
    const back = socket("host-user");
    handleJoinRoom(back.ws, { roomCode: code, playerName: "Host" });
    expect(last(back, "room-joined")).toMatchObject({ roomCode: code, yourSlot: 0 });
    handleChat(back.ws, { roomCode: code, text: "back" });
    expect(last(back, "chat-message")?.text).toBe("back");
  });
});

describe("lobby reconnect grace", () => {
  function lobby(): { host: FakeSocket; guest: FakeSocket; code: string } {
    const host = socket("host-user");
    handleCreateRoom(host.ws, { gameSlug: "durak", playerName: "Host" });
    const code = last(host, "room-created")?.roomCode as string;
    const guest = socket("guest-user");
    handleJoinRoom(guest.ws, { roomCode: code, playerName: "Guest" });
    return { host, guest, code };
  }

  it("keeps the room open while the host refreshes", () => {
    const { host, guest, code } = lobby();
    handleWsClose(host.ws);
    expect(last(guest, "room-closed")).toBeUndefined();

    const back = socket("host-user");
    handleJoinRoom(back.ws, { roomCode: code, playerName: "Host" });
    expect(last(back, "room-joined")).toMatchObject({ yourSlot: 0 });
    vi.advanceTimersByTime(LOBBY_RECONNECT_GRACE_MS * 2);
    expect(last(guest, "room-closed")).toBeUndefined();

    // Still the host: can start the game.
    handleToggleReady(guest.ws, { roomCode: code });
    handleStartRoom(back.ws, { roomCode: code, config: {} });
    expect(last(guest, "game-started")).toBeDefined();
  });

  it("closes the room when the host doesn't come back", () => {
    const { host, guest } = lobby();
    handleWsClose(host.ws);
    vi.advanceTimersByTime(LOBBY_RECONNECT_GRACE_MS + 1);
    expect(last(guest, "room-closed")?.reason).toBe("Host left the room");
  });

  it("holds a guest's seat through a refresh, then frees it", () => {
    const { host, guest, code } = lobby();
    handleWsClose(guest.ws);
    const state = last(host, "room-updated")?.roomState as {
      slots: { kind: string; connected: boolean }[];
    };
    expect(state.slots[1]).toMatchObject({ kind: "human", connected: false });

    const back = socket("guest-user");
    handleJoinRoom(back.ws, { roomCode: code, playerName: "Guest" });
    expect(last(back, "room-joined")).toMatchObject({ yourSlot: 1 });

    handleWsClose(back.ws);
    vi.advanceTimersByTime(LOBBY_RECONNECT_GRACE_MS + 1);
    const after = last(host, "room-updated")?.roomState as { slots: { kind: string }[] };
    expect(after.slots[1]?.kind).toBe("open");
  });

  it("still refuses a second tab while the first is connected", () => {
    const { code } = lobby();
    const twin = socket("guest-user");
    handleJoinRoom(twin.ws, { roomCode: code, playerName: "Guest" });
    expect(last(twin, "error")?.message).toBe("You are already in this room");
  });
});
