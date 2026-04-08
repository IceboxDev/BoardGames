import { useCallback, useState } from "react";
import { useGameSession } from "../lib/ws-client";

export interface RemoteGameState<TView, TAction, TResult> {
  view: TView | null;
  legalActions: TAction[];
  phase: string;
  activePlayer: number;
  playerIndex: number;
  isMyTurn: boolean;
  result: TResult | null;
  replayId: number | null;
  isConnected: boolean;
  isAiThinking: boolean;
  error: string | null;
  send: (action: TAction) => void;
  start: (config: unknown) => void;
  reset: () => void;
}

export function useRemoteGame<TView = unknown, TAction = unknown, TResult = unknown>(
  gameSlug: string,
): RemoteGameState<TView, TAction, TResult> {
  const session = useGameSession<TView, TAction, TResult>();
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

  return {
    view: session.playerView,
    legalActions: session.legalActions,
    phase: started ? "active" : "idle",
    activePlayer: session.activePlayer,
    playerIndex: session.playerIndex,
    isMyTurn: session.activePlayer === session.playerIndex,
    result: session.result,
    replayId: session.replayId,
    isConnected: session.status === "connected",
    isAiThinking: session.aiThinking,
    error: session.error,
    send: session.sendAction,
    start,
    reset,
  };
}
