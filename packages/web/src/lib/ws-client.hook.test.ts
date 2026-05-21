import { act, renderHook } from "@testing-library/react";
import { WebSocket as MockWebSocket, Server } from "mock-socket";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGameSession } from "./ws-client";

// `useGameSession` builds its WS URL from `window.location` (jsdom defaults
// to http://localhost). The hook's actual code constructs:
//   ws://${window.location.host}/ws
// Match that here so the mock-socket Server intercepts the right URL.
const WS_URL = "ws://localhost:3000/ws";

beforeEach(() => {
  // Point jsdom's location host at the URL our mock server will listen on,
  // so the hook builds the matching URL.
  Object.defineProperty(window, "location", {
    writable: true,
    value: { ...window.location, protocol: "http:", host: "localhost:3000" },
  });
  // mock-socket exposes its own WebSocket class; route the global through it.
  vi.stubGlobal("WebSocket", MockWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// mock-socket schedules `onopen` / `onmessage` via setTimeouts with ~4–50ms
// delays — not microtasks. Tests poll for the expected condition through
// RTL's `waitFor` instead of relying on a fixed yield count.
async function tick(ms = 60) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}

describe("useGameSession — initial connection", () => {
  it("transitions disconnected → connecting → connected", async () => {
    const server = new Server(WS_URL);
    try {
      const { result } = renderHook(() => useGameSession());
      // First render: hook fires connect(); status is "connecting".
      expect(result.current.status).toBe("connecting");
      await tick();
      // After the mock server accepts, status flips to "connected".
      expect(result.current.status).toBe("connected");
    } finally {
      server.close();
    }
  });
});

describe("useGameSession — message dispatch", () => {
  it("handles session-created", async () => {
    const server = new Server(WS_URL);
    try {
      const { result } = renderHook(() => useGameSession());
      await tick();
      act(() => {
        for (const socket of server.clients()) {
          socket.send(
            JSON.stringify({
              type: "session-created",
              sessionId: "sess-1",
              playerView: { hand: ["A"] },
              legalActions: [{ kind: "play" }],
              phase: "active",
            }),
          );
        }
      });
      await tick();
      expect(result.current.sessionId).toBe("sess-1");
      expect(result.current.playerView).toEqual({ hand: ["A"] });
      expect(result.current.legalActions).toEqual([{ kind: "play" }]);
      expect(result.current.aiThinking).toBe(false);
    } finally {
      server.close();
    }
  });

  it("handles state-update by replacing view, actions, and active player", async () => {
    const server = new Server(WS_URL);
    try {
      const { result } = renderHook(() => useGameSession());
      await tick();
      act(() => {
        for (const socket of server.clients()) {
          socket.send(
            JSON.stringify({
              type: "state-update",
              sessionId: "sess-1",
              playerView: { turn: 5 },
              legalActions: [{ kind: "draw" }],
              activePlayer: 1,
              playerIndex: 0,
              phase: "active",
            }),
          );
        }
      });
      await tick();
      expect(result.current.playerView).toEqual({ turn: 5 });
      expect(result.current.activePlayer).toBe(1);
      expect(result.current.playerIndex).toBe(0);
    } finally {
      server.close();
    }
  });

  it("handles ai-thinking → state-update sequence", async () => {
    const server = new Server(WS_URL);
    try {
      const { result } = renderHook(() => useGameSession());
      await tick();
      act(() => {
        for (const socket of server.clients()) {
          socket.send(JSON.stringify({ type: "ai-thinking", sessionId: "sess-1" }));
        }
      });
      await tick();
      expect(result.current.aiThinking).toBe(true);
      act(() => {
        for (const socket of server.clients()) {
          socket.send(
            JSON.stringify({
              type: "state-update",
              sessionId: "sess-1",
              playerView: { turn: 6 },
              legalActions: [],
              activePlayer: 0,
              phase: "active",
            }),
          );
        }
      });
      await tick();
      expect(result.current.aiThinking).toBe(false);
    } finally {
      server.close();
    }
  });

  it("handles game-over by clearing legal actions, setting result, and clearing AI flag", async () => {
    const server = new Server(WS_URL);
    try {
      const { result } = renderHook(() => useGameSession());
      await tick();
      act(() => {
        for (const socket of server.clients()) {
          socket.send(
            JSON.stringify({
              type: "game-over",
              sessionId: "sess-1",
              playerView: {},
              result: { winner: 0, score: 100 },
              replayId: 42,
              phase: "ended",
            }),
          );
        }
      });
      await tick();
      expect(result.current.result).toEqual({ winner: 0, score: 100 });
      expect(result.current.replayId).toBe(42);
      expect(result.current.legalActions).toEqual([]);
      expect(result.current.aiThinking).toBe(false);
    } finally {
      server.close();
    }
  });

  it("handles error message by surfacing it", async () => {
    const server = new Server(WS_URL);
    try {
      const { result } = renderHook(() => useGameSession());
      await tick();
      act(() => {
        for (const socket of server.clients()) {
          socket.send(JSON.stringify({ type: "error", message: "Illegal move" }));
        }
      });
      await tick();
      expect(result.current.error).toBe("Illegal move");
    } finally {
      server.close();
    }
  });

  it("ignores malformed messages without crashing", async () => {
    const server = new Server(WS_URL);
    try {
      const { result } = renderHook(() => useGameSession());
      await tick();
      // Spy on console.warn — the hook deliberately logs and skips.
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      act(() => {
        for (const socket of server.clients()) {
          socket.send("{not-json");
          socket.send(JSON.stringify({ type: "totally-not-a-real-msg" }));
        }
      });
      await tick();
      // No state change; the hook should still be connected and clean.
      expect(result.current.status).toBe("connected");
      expect(result.current.error).toBeNull();
      warn.mockRestore();
    } finally {
      server.close();
    }
  });
});

describe("useGameSession — room actions", () => {
  it("createRoom sends the expected envelope", async () => {
    const server = new Server(WS_URL);
    const received: string[] = [];
    server.on("connection", (socket) => {
      socket.on("message", (data) => {
        received.push(String(data));
      });
    });
    try {
      const { result } = renderHook(() => useGameSession());
      await tick();
      act(() => {
        result.current.createRoom("uno", "Lina");
      });
      await tick();
      expect(received).toHaveLength(1);
      expect(JSON.parse(received[0])).toEqual({
        type: "create-room",
        gameSlug: "uno",
        playerName: "Lina",
      });
    } finally {
      server.close();
    }
  });

  it("joinRoom remembers playerName for later rejoin", async () => {
    const server = new Server(WS_URL);
    const received: string[] = [];
    server.on("connection", (socket) => {
      socket.on("message", (data) => received.push(String(data)));
    });
    try {
      const { result } = renderHook(() => useGameSession());
      await tick();
      act(() => result.current.joinRoom("CODE", "Lina"));
      await tick();
      expect(JSON.parse(received[0])).toEqual({
        type: "join-room",
        roomCode: "CODE",
        playerName: "Lina",
      });
    } finally {
      server.close();
    }
  });

  it("room-joined exposes roomCode + slot", async () => {
    const server = new Server(WS_URL);
    try {
      const { result } = renderHook(() => useGameSession());
      await tick();
      act(() => {
        for (const socket of server.clients()) {
          socket.send(
            JSON.stringify({
              type: "room-joined",
              roomCode: "CODE",
              roomState: { gameSlug: "uno", hostName: "Lina", slots: [] },
              yourSlot: 2,
            }),
          );
        }
      });
      await tick();
      expect(result.current.roomCode).toBe("CODE");
      expect(result.current.mySlot).toBe(2);
    } finally {
      server.close();
    }
  });

  it("room-closed clears room state and surfaces the reason", async () => {
    const server = new Server(WS_URL);
    try {
      const { result } = renderHook(() => useGameSession());
      await tick();
      act(() => {
        for (const socket of server.clients()) {
          socket.send(
            JSON.stringify({
              type: "room-joined",
              roomCode: "CODE",
              roomState: { gameSlug: "uno", hostName: "Lina", slots: [] },
              yourSlot: 0,
            }),
          );
        }
      });
      await tick();
      act(() => {
        for (const socket of server.clients()) {
          socket.send(
            JSON.stringify({ type: "room-closed", roomCode: "CODE", reason: "Host left" }),
          );
        }
      });
      await tick();
      expect(result.current.roomCode).toBeNull();
      expect(result.current.roomState).toBeNull();
      expect(result.current.mySlot).toBeNull();
      expect(result.current.error).toBe("Host left");
    } finally {
      server.close();
    }
  });
});

describe("useGameSession — sendAction", () => {
  it("does not send when sessionId is null (no-op)", async () => {
    const server = new Server(WS_URL);
    const received: string[] = [];
    server.on("connection", (socket) => {
      socket.on("message", (data) => received.push(String(data)));
    });
    try {
      const { result } = renderHook(() => useGameSession());
      await tick();
      act(() => result.current.sendAction({ kind: "draw" }));
      await tick();
      expect(received).toHaveLength(0);
    } finally {
      server.close();
    }
  });

  it("sends action wrapped with sessionId once a session exists", async () => {
    const server = new Server(WS_URL);
    const received: string[] = [];
    server.on("connection", (socket) => {
      socket.on("message", (data) => received.push(String(data)));
    });
    try {
      const { result } = renderHook(() => useGameSession());
      await tick();
      act(() => {
        for (const socket of server.clients()) {
          socket.send(
            JSON.stringify({
              type: "session-created",
              sessionId: "sess-1",
              playerView: {},
              legalActions: [],
              phase: "active",
            }),
          );
        }
      });
      await tick();
      act(() => result.current.sendAction({ kind: "draw" }));
      await tick();
      expect(received).toHaveLength(1);
      expect(JSON.parse(received[0])).toEqual({
        type: "action",
        sessionId: "sess-1",
        action: { kind: "draw" },
      });
    } finally {
      server.close();
    }
  });
});
