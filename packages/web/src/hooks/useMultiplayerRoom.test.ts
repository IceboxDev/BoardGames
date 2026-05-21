import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GameSession } from "../lib/ws-client";
import { useMultiplayerRoom } from "./useMultiplayerRoom";

function makeSession(overrides: Partial<GameSession<unknown, unknown, unknown>> = {}) {
  return {
    status: "connected",
    sessionId: null,
    playerView: null,
    legalActions: [],
    activePlayer: 0,
    playerIndex: 0,
    aiThinking: false,
    result: null,
    replayId: null,
    error: null,
    roomCode: null,
    roomState: null,
    mySlot: null,
    createSession: vi.fn(),
    sendAction: vi.fn(),
    leaveSession: vi.fn(),
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    leaveRoom: vi.fn(),
    configureRoom: vi.fn(),
    startRoom: vi.fn(),
    kickPlayer: vi.fn(),
    toggleReady: vi.fn(),
    ...overrides,
  } as GameSession<unknown, unknown, unknown>;
}

describe("useMultiplayerRoom — phase derivation", () => {
  it("is 'idle' when there is no room and no session", () => {
    const { result } = renderHook(() => useMultiplayerRoom("uno", makeSession()));
    expect(result.current.phase).toBe("idle");
  });

  it("is 'lobby' when a room exists but no session has started", () => {
    const { result } = renderHook(() =>
      useMultiplayerRoom("uno", makeSession({ roomCode: "CODE" })),
    );
    expect(result.current.phase).toBe("lobby");
  });

  it("is 'playing' when both sessionId and playerView are set", () => {
    const session = makeSession({
      roomCode: "CODE",
      sessionId: "sess-1",
      playerView: { turn: 1 },
    });
    const { result } = renderHook(() => useMultiplayerRoom("uno", session));
    expect(result.current.phase).toBe("playing");
  });
});

describe("useMultiplayerRoom — host detection", () => {
  it("isHost is true when mySlot === 0", () => {
    const { result } = renderHook(() => useMultiplayerRoom("uno", makeSession({ mySlot: 0 })));
    expect(result.current.isHost).toBe(true);
  });

  it("isHost is false for any other slot", () => {
    const { result } = renderHook(() => useMultiplayerRoom("uno", makeSession({ mySlot: 2 })));
    expect(result.current.isHost).toBe(false);
  });

  it("isHost is false when mySlot is null", () => {
    const { result } = renderHook(() => useMultiplayerRoom("uno", makeSession({ mySlot: null })));
    expect(result.current.isHost).toBe(false);
  });
});

describe("useMultiplayerRoom — actions delegate to the session", () => {
  it("createRoom calls session.createRoom with the bound slug + name", () => {
    const session = makeSession();
    const { result } = renderHook(() => useMultiplayerRoom("sky-team", session));
    act(() => result.current.createRoom("Mantas"));
    expect(session.createRoom).toHaveBeenCalledWith("sky-team", "Mantas");
  });

  it("joinRoom / kickPlayer / startRoom / toggleReady forward to the session", () => {
    const session = makeSession();
    const { result } = renderHook(() => useMultiplayerRoom("sky-team", session));
    act(() => result.current.joinRoom("CODE", "Lina"));
    expect(session.joinRoom).toHaveBeenCalledWith("CODE", "Lina");
    act(() => result.current.kickPlayer(1));
    expect(session.kickPlayer).toHaveBeenCalledWith(1);
    act(() => result.current.startRoom({ scenario: "yul-montreal" }));
    expect(session.startRoom).toHaveBeenCalledWith({ scenario: "yul-montreal" });
    act(() => result.current.toggleReady());
    expect(session.toggleReady).toHaveBeenCalled();
  });

  it("reset() calls session.leaveSession", () => {
    const session = makeSession();
    const { result } = renderHook(() => useMultiplayerRoom("sky-team", session));
    act(() => result.current.reset());
    expect(session.leaveSession).toHaveBeenCalled();
  });
});

describe("useMultiplayerRoom — isMyTurn", () => {
  it("is true when activePlayer matches playerIndex", () => {
    const session = makeSession({ activePlayer: 1, playerIndex: 1 });
    const { result } = renderHook(() => useMultiplayerRoom("uno", session));
    expect(result.current.isMyTurn).toBe(true);
  });

  it("is false when they differ", () => {
    const session = makeSession({ activePlayer: 0, playerIndex: 1 });
    const { result } = renderHook(() => useMultiplayerRoom("uno", session));
    expect(result.current.isMyTurn).toBe(false);
  });
});
