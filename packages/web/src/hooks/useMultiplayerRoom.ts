import type { RoomSlot, RoomState } from "@boardgames/core/protocol";
import { useCallback, useMemo } from "react";
import type {
  ChatMessage,
  ConnectionStatus,
  GameSession,
  PeerConnectionState,
} from "../lib/ws-client";

export interface MultiplayerRoomState<TView, TAction, TResult> {
  // Connection
  /** Full transport status — distinguishes connecting / reconnecting / error
   *  from a plain connected/disconnected boolean. */
  status: ConnectionStatus;
  /** Convenience derived from `status` — kept for existing consumers. */
  isConnected: boolean;
  /** Game-rule / lobby error (illegal move, "room not found", host left). */
  error: string | null;
  /** Transport-level error (socket down / send dropped). */
  connectionError: string | null;
  /** Connection state of the other seated humans — drives "player X
   *  disconnected" banners. */
  peers: PeerConnectionState[];

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
  swapSeats: (a: number, b: number) => void;

  // Room chat (Sky Team briefing today; available to any game that wants it)
  chatMessages: ChatMessage[];
  sendChat: (text: string) => void;

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
  // The shared session also carries solo games (`useRemoteGame`); this
  // projection only surfaces sessions bound to a room. Without the
  // discriminator, an active solo game made `phase` report "playing" the
  // moment a room was created — the lobby route then "started" the game and
  // rendered the solo board as if it were the room's.
  const isRoomGame = session.gameRoomCode != null;

  const phase = useMemo(() => {
    if (isRoomGame && session.sessionId && session.playerView) return "playing" as const;
    if (session.roomCode) return "lobby" as const;
    return "idle" as const;
  }, [isRoomGame, session.sessionId, session.playerView, session.roomCode]);

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
    status: session.status,
    isConnected: session.status === "connected",
    error: session.error,
    connectionError: session.connectionError,
    peers: session.peers,

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
    swapSeats: session.swapSeats,

    chatMessages: session.chatMessages,
    sendChat: session.sendChat,

    view: isRoomGame ? session.playerView : null,
    legalActions: isRoomGame ? session.legalActions : [],
    activePlayer: session.activePlayer,
    playerIndex: session.playerIndex,
    isMyTurn: session.activePlayer === session.playerIndex,
    isAiThinking: isRoomGame && session.aiThinking,
    result: isRoomGame ? session.result : null,
    replayId: session.replayId,
    send: session.sendAction,
    reset,
  };
}
