import { useCallback, useEffect, useRef, useState } from "react";

type ServerMessage =
  | { type: "session-created"; sessionId: string; playerView: unknown; legalActions: unknown[] }
  | {
      type: "state-update";
      sessionId: string;
      playerView: unknown;
      legalActions: unknown[];
      activePlayer: number;
    }
  | { type: "ai-thinking"; sessionId: string }
  | {
      type: "game-over";
      sessionId: string;
      result: unknown;
      playerView: unknown;
      replayId?: number;
    }
  | { type: "error"; sessionId?: string; message: string };

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export interface GameSession<TPlayerView, TAction, TResult> {
  status: ConnectionStatus;
  sessionId: string | null;
  playerView: TPlayerView | null;
  legalActions: TAction[];
  activePlayer: number;
  aiThinking: boolean;
  result: TResult | null;
  replayId: number | null;
  error: string | null;
  createSession: (gameSlug: string, config: unknown) => void;
  sendAction: (action: TAction) => void;
  leaveSession: () => void;
}

const WS_URL =
  typeof window !== "undefined"
    ? `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`
    : "ws://localhost:3001/ws";

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];

export function useGameSession<
  TPlayerView = unknown,
  TAction = unknown,
  TResult = unknown,
>(): GameSession<TPlayerView, TAction, TResult> {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [playerView, setPlayerView] = useState<TPlayerView | null>(null);
  const [legalActions, setLegalActions] = useState<TAction[]>([]);
  const [activePlayer, setActivePlayer] = useState(0);
  const [aiThinking, setAiThinking] = useState(false);
  const [result, setResult] = useState<TResult | null>(null);
  const [replayId, setReplayId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus("connected");
      setError(null);
      reconnectAttemptRef.current = 0;
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data) as ServerMessage;

      switch (msg.type) {
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
          setAiThinking(false);
          break;

        case "ai-thinking":
          setAiThinking(true);
          break;

        case "game-over":
          setPlayerView(msg.playerView as TPlayerView);
          setResult(msg.result as TResult);
          setReplayId(msg.replayId ?? null);
          setLegalActions([]);
          setAiThinking(false);
          break;

        case "error":
          setError(msg.message);
          setAiThinking(false);
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
  }, [sendMessage, sessionId]);

  return {
    status,
    sessionId,
    playerView,
    legalActions,
    activePlayer,
    aiThinking,
    result,
    replayId,
    error,
    createSession,
    sendAction,
    leaveSession,
  };
}
