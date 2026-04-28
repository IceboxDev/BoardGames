import type { RoomSlot, RoomState } from "@boardgames/core/protocol/messages";
import { useCallback, useEffect, useRef, useState } from "react";

type ServerMessage =
  // Session messages
  | { type: "session-created"; sessionId: string; playerView: unknown; legalActions: unknown[] }
  | {
      type: "state-update";
      sessionId: string;
      playerView: unknown;
      legalActions: unknown[];
      activePlayer: number;
      playerIndex?: number;
    }
  | { type: "ai-thinking"; sessionId: string }
  | {
      type: "game-over";
      sessionId: string;
      result: unknown;
      playerView: unknown;
      playerIndex?: number;
      replayId?: number;
    }
  | { type: "error"; sessionId?: string; message: string }
  // Room / lobby messages
  | { type: "room-created"; roomCode: string; roomState: RoomState }
  | { type: "room-joined"; roomCode: string; roomState: RoomState; yourSlot: number }
  | { type: "room-updated"; roomCode: string; roomState: RoomState }
  | { type: "room-closed"; roomCode: string; reason: string }
  | {
      type: "game-started";
      roomCode: string;
      sessionId: string;
      playerIndex: number;
      activePlayer: number;
      playerView: unknown;
      legalActions: unknown[];
      phase: string;
    }
  | { type: "player-disconnected"; sessionId: string; playerIndex: number; playerName: string }
  | { type: "player-reconnected"; sessionId: string; playerIndex: number; playerName: string };

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface GameSession<TPlayerView, TAction, TResult> {
  // Connection
  status: ConnectionStatus;
  error: string | null;

  // Solo session state
  sessionId: string | null;
  playerView: TPlayerView | null;
  legalActions: TAction[];
  activePlayer: number;
  playerIndex: number;
  aiThinking: boolean;
  result: TResult | null;
  replayId: number | null;

  // Room state
  roomCode: string | null;
  roomState: RoomState | null;
  mySlot: number | null;

  // Solo session actions
  createSession: (gameSlug: string, config: unknown) => void;
  sendAction: (action: TAction) => void;
  leaveSession: () => void;

  // Room actions
  createRoom: (gameSlug: string, playerName: string) => void;
  joinRoom: (roomCode: string, playerName: string) => void;
  leaveRoom: () => void;
  configureRoom: (slots: RoomSlot[]) => void;
  startRoom: (config: unknown) => void;
  kickPlayer: (slotIndex: number) => void;
  toggleReady: () => void;
}

const WS_URL =
  (import.meta.env.VITE_WS_URL as string | undefined) ??
  (typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`
    : "ws://localhost:3001/ws");

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

export function useGameSession<
  TPlayerView = unknown,
  TAction = unknown,
  TResult = unknown,
>(): GameSession<TPlayerView, TAction, TResult> {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Refs for auto-rejoin on reconnect
  const pendingRejoinRef = useRef<{ roomCode: string; playerName: string } | null>(null);

  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [playerView, setPlayerView] = useState<TPlayerView | null>(null);
  const [legalActions, setLegalActions] = useState<TAction[]>([]);
  const [activePlayer, setActivePlayer] = useState(0);
  const [playerIndex, setPlayerIndex] = useState(0);
  const [aiThinking, setAiThinking] = useState(false);
  const [result, setResult] = useState<TResult | null>(null);
  const [replayId, setReplayId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Room state
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [mySlot, setMySlot] = useState<number | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      setError(null);
      reconnectAttemptRef.current = 0;

      // Auto-rejoin room on reconnect
      if (pendingRejoinRef.current) {
        const { roomCode: code, playerName } = pendingRejoinRef.current;
        ws.send(JSON.stringify({ type: "join-room", roomCode: code, playerName }));
      }
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data) as ServerMessage;

      switch (msg.type) {
        // --- Solo session messages ---
        case "session-created":
          setSessionId(msg.sessionId);
          setPlayerView(msg.playerView as TPlayerView);
          setLegalActions(msg.legalActions as TAction[]);
          setAiThinking(false);
          setResult(null);
          setError(null);
          break;

        case "state-update":
          setPlayerView(msg.playerView as TPlayerView);
          setLegalActions(msg.legalActions as TAction[]);
          setActivePlayer(msg.activePlayer);
          if (msg.playerIndex !== undefined) setPlayerIndex(msg.playerIndex);
          setAiThinking(false);
          break;

        case "ai-thinking":
          setAiThinking(true);
          break;

        case "game-over":
          setPlayerView(msg.playerView as TPlayerView);
          setResult(msg.result as TResult);
          setReplayId(msg.replayId ?? null);
          if (msg.playerIndex !== undefined) setPlayerIndex(msg.playerIndex);
          setLegalActions([]);
          setAiThinking(false);
          break;

        case "error":
          setError(msg.message);
          setAiThinking(false);
          break;

        // --- Room / lobby messages ---
        case "room-created":
          setRoomCode(msg.roomCode);
          setRoomState(msg.roomState);
          setMySlot(0);
          setError(null);
          pendingRejoinRef.current = {
            roomCode: msg.roomCode,
            playerName: playerNameRef.current,
          };
          break;

        case "room-joined":
          setRoomCode(msg.roomCode);
          setRoomState(msg.roomState);
          setMySlot(msg.yourSlot);
          setError(null);
          break;

        case "room-updated":
          setRoomState(msg.roomState);
          break;

        case "room-closed":
          setRoomCode(null);
          setRoomState(null);
          setMySlot(null);
          pendingRejoinRef.current = null;
          setError(msg.reason);
          break;

        case "game-started":
          setSessionId(msg.sessionId);
          setPlayerIndex(msg.playerIndex);
          setActivePlayer(msg.activePlayer);
          setPlayerView(msg.playerView as TPlayerView);
          setLegalActions(msg.legalActions as TAction[]);
          setResult(null);
          setAiThinking(false);
          setError(null);
          break;

        case "player-disconnected":
        case "player-reconnected":
          // These could drive UI notifications in the future
          break;
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      wsRef.current = null;

      const attempt = reconnectAttemptRef.current;
      if (attempt < RECONNECT_DELAYS.length) {
        reconnectTimerRef.current = setTimeout(() => {
          reconnectAttemptRef.current++;
          connect();
        }, RECONNECT_DELAYS[attempt]);
      }
    };

    ws.onerror = () => {
      setStatus("error");
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback((msg: unknown) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify(msg));
  }, []);

  // --- Solo session actions ---

  const createSession = useCallback(
    (gameSlug: string, config: unknown) => {
      sendMessage({ type: "create-session", gameSlug, config });
    },
    [sendMessage],
  );

  const sendAction = useCallback(
    (action: TAction) => {
      if (!sessionId) return;
      sendMessage({ type: "action", sessionId, action });
    },
    [sendMessage, sessionId],
  );

  const leaveSession = useCallback(() => {
    if (!sessionId) return;
    sendMessage({ type: "leave-session", sessionId });
    setSessionId(null);
    setPlayerView(null);
    setLegalActions([]);
    setResult(null);
    setReplayId(null);
    setPlayerIndex(0);
    setRoomCode(null);
    setRoomState(null);
    setMySlot(null);
    pendingRejoinRef.current = null;
  }, [sendMessage, sessionId]);

  // --- Room actions ---

  const playerNameRef = useRef<string>("");

  const createRoom = useCallback(
    (gameSlug: string, playerName: string) => {
      playerNameRef.current = playerName;
      pendingRejoinRef.current = null; // set on room-created
      sendMessage({ type: "create-room", gameSlug, playerName });
    },
    [sendMessage],
  );

  const joinRoom = useCallback(
    (code: string, playerName: string) => {
      pendingRejoinRef.current = { roomCode: code, playerName };
      sendMessage({ type: "join-room", roomCode: code, playerName });
    },
    [sendMessage],
  );

  const leaveRoom = useCallback(() => {
    if (!roomCode) return;
    sendMessage({ type: "leave-room", roomCode });
    setRoomCode(null);
    setRoomState(null);
    setMySlot(null);
    pendingRejoinRef.current = null;
  }, [sendMessage, roomCode]);

  const configureRoom = useCallback(
    (slots: RoomSlot[]) => {
      if (!roomCode) return;
      sendMessage({ type: "configure-room", roomCode, slots });
    },
    [sendMessage, roomCode],
  );

  const startRoom = useCallback(
    (config: unknown) => {
      if (!roomCode) return;
      sendMessage({ type: "start-room", roomCode, config });
    },
    [sendMessage, roomCode],
  );

  const kickPlayer = useCallback(
    (slotIndex: number) => {
      if (!roomCode) return;
      sendMessage({ type: "kick-player", roomCode, slotIndex });
    },
    [sendMessage, roomCode],
  );

  const toggleReady = useCallback(() => {
    if (!roomCode) return;
    sendMessage({ type: "toggle-ready", roomCode });
  }, [sendMessage, roomCode]);

  return {
    status,
    sessionId,
    playerView,
    legalActions,
    activePlayer,
    playerIndex,
    aiThinking,
    result,
    replayId,
    error,
    roomCode,
    roomState,
    mySlot,
    createSession,
    sendAction,
    leaveSession,
    createRoom,
    joinRoom,
    leaveRoom,
    configureRoom,
    startRoom,
    kickPlayer,
    toggleReady,
  };
}
