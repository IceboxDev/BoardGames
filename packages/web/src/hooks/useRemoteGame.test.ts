import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { GameSession } from "../lib/ws-client";
import { useRemoteGame } from "./useRemoteGame";

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

describe("useRemoteGame", () => {
  it("projects session.status onto isConnected", () => {
    const session = makeSession({ status: "connected" });
    const { result } = renderHook(() => useRemoteGame("uno", session));
    expect(result.current.isConnected).toBe(true);
  });

  it("isConnected is false when the session is not connected", () => {
    const { result } = renderHook(() =>
      useRemoteGame("uno", makeSession({ status: "disconnected" })),
    );
    expect(result.current.isConnected).toBe(false);
  });

  it("isMyTurn is true when activePlayer === playerIndex", () => {
    const session = makeSession({ activePlayer: 2, playerIndex: 2 });
    const { result } = renderHook(() => useRemoteGame("uno", session));
    expect(result.current.isMyTurn).toBe(true);
  });

  it("isMyTurn is false on the opponent's turn", () => {
    const session = makeSession({ activePlayer: 0, playerIndex: 1 });
    const { result } = renderHook(() => useRemoteGame("uno", session));
    expect(result.current.isMyTurn).toBe(false);
  });

  it("phase is 'idle' before start() is called and 'active' after", () => {
    const session = makeSession();
    const { result, rerender } = renderHook(() => useRemoteGame("uno", session));
    expect(result.current.phase).toBe("idle");
    act(() => result.current.start({ difficulty: "hard" }));
    rerender();
    expect(result.current.phase).toBe("active");
  });

  it("start() forwards game slug + config to session.createSession", () => {
    const session = makeSession();
    const { result } = renderHook(() => useRemoteGame("lost-cities", session));
    act(() => result.current.start({ engine: "ismcts-v5" }));
    expect(session.createSession).toHaveBeenCalledWith("lost-cities", { engine: "ismcts-v5" });
  });

  it("reset() calls session.leaveSession and returns phase to idle", () => {
    const session = makeSession();
    const { result, rerender } = renderHook(() => useRemoteGame("uno", session));
    act(() => result.current.start({}));
    rerender();
    expect(result.current.phase).toBe("active");
    act(() => result.current.reset());
    rerender();
    expect(result.current.phase).toBe("idle");
    expect(session.leaveSession).toHaveBeenCalled();
  });

  it("forwards view / legalActions / result through unchanged", () => {
    const session = makeSession({
      playerView: { foo: "bar" },
      legalActions: [{ kind: "draw" }],
      result: { winner: 1 },
      replayId: 7,
    });
    const { result } = renderHook(() => useRemoteGame("uno", session));
    expect(result.current.view).toEqual({ foo: "bar" });
    expect(result.current.legalActions).toEqual([{ kind: "draw" }]);
    expect(result.current.result).toEqual({ winner: 1 });
    expect(result.current.replayId).toBe(7);
  });
});
