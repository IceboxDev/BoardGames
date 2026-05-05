import type { RoomSlot, RoomState } from "@boardgames/core/protocol";
import { useCallback, useMemo } from "react";
import type { GameSession } from "../lib/ws-client";

export interface MultiplayerRoomState<TView, TAction, TResult> {
  // Connection
  isConnected: boolean;
  error: string | null;

  // Lobby
  roomCode: string | null;
  roomState: RoomState | null;
  mySlot: number | null;
  isHost: boolean;
  phase: "idle" | "lobby" | "playing";

  // Lobby actions
  createRoom: (playerName: string) => void;
  joinRoom: (code: string, playerName: string) => void;
  leaveRoom: () => void;
  configureRoom: (slots: RoomSlot[]) => void;
  startRoom: (config: unknown) => void;
  kickPlayer: (slotIndex: number) => void;
  toggleReady: () => void;

  // Game state (available after game starts)
  view: TView | null;
  legalActions: TAction[];
  activePlayer: number;
  playerIndex: number;
  isMyTurn: boolean;
  isAiThinking: boolean;
  result: TResult | null;
  replayId: number | null;
  send: (action: TAction) => void;
  reset: () => void;
}

/**
 * Projection over a shared {@link GameSession} for multiplayer (lobby + room)
 * gameplay. The session itself is owned by {@link useGameShell} so a single
 * WebSocket backs both this projection and {@link useRemoteGame}.
 */
export function useMultiplayerRoom<TView = unknown, TAction = unknown, TResult = unknown>(
  gameSlug: string,
  session: GameSession<TView, TAction, TResult>,
): MultiplayerRoomState<TView, TAction, TResult> {
  const phase = useMemo(() => {
    if (session.sessionId && session.playerView) return "playing" as const;
    if (session.roomCode) return "lobby" as const;
    return "idle" as const;
  }, [session.sessionId, session.playerView, session.roomCode]);

  const createRoom = useCallback(
    (playerName: string) => {
      session.createRoom(gameSlug, playerName);
    },
    [session.createRoom, gameSlug],
  );

  const reset = useCallback(() => {
    session.leaveSession();
  }, [session.leaveSession]);

  return {
    isConnected: session.status === "connected",
    error: session.error,

    roomCode: session.roomCode,
    roomState: session.roomState,
    mySlot: session.mySlot,
    isHost: session.mySlot === 0,
    phase,

    createRoom,
    joinRoom: session.joinRoom,
    leaveRoom: session.leaveRoom,
    configureRoom: session.configureRoom,
    startRoom: session.startRoom,
    kickPlayer: session.kickPlayer,
    toggleReady: session.toggleReady,

    view: session.playerView,
    legalActions: session.legalActions,
    activePlayer: session.activePlayer,
    playerIndex: session.playerIndex,
    isMyTurn: session.activePlayer === session.playerIndex,
    isAiThinking: session.aiThinking,
    result: session.result,
    replayId: session.replayId,
    send: session.sendAction,
    reset,
  };
}
