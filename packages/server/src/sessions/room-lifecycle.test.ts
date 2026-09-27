/**
 * A started room outlives a dropped connection: everyone can refresh, lose
 * signal or lock their phone and come back to the same game within the grace
 * period; only after it does the room close and the game end.
 */

import type { WSContext } from "hono/ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { handleWsClose, wsAuth } from "./manager.ts";
import {
  handleConfigureRoom,
  handleCreateRoom,
  handleJoinRoom,
  handleStartRoom,
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
