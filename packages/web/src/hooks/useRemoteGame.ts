import { useCallback, useState } from "react";
import type { ConnectionStatus, GameSession } from "../lib/ws-client";

export interface RemoteGameState<TView, TAction, TResult> {
  view: TView | null;
  legalActions: TAction[];
  phase: string;
  activePlayer: number;
  playerIndex: number;
  isMyTurn: boolean;
  result: TResult | null;
  replayId: number | null;
  /** Full transport status. Prefer this over `isConnected` when the UI needs
   *  to distinguish "connecting" / "reconnecting" from a hard failure. */
  status: ConnectionStatus;
  /** Convenience derived from `status` — kept for existing consumers. */
  isConnected: boolean;
  isAiThinking: boolean;
  /** Game-rule error (illegal move, etc.). Distinct from `connectionError`. */
  error: string | null;
  /** Transport-level error (socket down / send dropped). */
  connectionError: string | null;
  send: (action: TAction) => void;
  start: (config: unknown) => void;
  reset: () => void;
}

/**
 * Projection over a shared {@link GameSession} for solo (vs-AI / single-player)
 * gameplay. The session itself is owned by {@link useGameShell} so a single
 * WebSocket backs both this projection and {@link useMultiplayerRoom}.
 */
export function useRemoteGame<TView = unknown, TAction = unknown, TResult = unknown>(
  gameSlug: string,
  session: GameSession<TView, TAction, TResult>,
): RemoteGameState<TView, TAction, TResult> {
  const [started, setStarted] = useState(false);

  const start = useCallback(
    (config: unknown) => {
      session.createSession(gameSlug, config);
      setStarted(true);
    },
    [session.createSession, gameSlug],
  );

  const reset = useCallback(() => {
    session.leaveSession();
    setStarted(false);
  }, [session.leaveSession]);

  // The shared session also carries room games (`useMultiplayerRoom`); this
  // projection only surfaces SOLO sessions, otherwise a room game would show
  // up as a phantom solo game (and vice versa).
  const isSoloGame = session.gameRoomCode == null;

  return {
    view: isSoloGame ? session.playerView : null,
    legalActions: isSoloGame ? session.legalActions : [],
    phase: started ? "active" : "idle",
    activePlayer: session.activePlayer,
    playerIndex: session.playerIndex,
    isMyTurn: session.activePlayer === session.playerIndex,
    result: isSoloGame ? session.result : null,
    replayId: session.replayId,
    status: session.status,
    isConnected: session.status === "connected",
    isAiThinking: isSoloGame && session.aiThinking,
    error: session.error,
    connectionError: session.connectionError,
    send: session.sendAction,
    start,
    reset,
  };
}
