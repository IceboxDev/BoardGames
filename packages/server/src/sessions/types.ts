export interface GameSessionAdapter<
  TState = unknown,
  TAction = unknown,
  TConfig = unknown,
  TPlayerView = unknown,
  TLegalAction = TAction,
  TResult = unknown,
> {
  createInitialState(config: TConfig): TState;
  getLegalActions(state: TState, player: number): TLegalAction[];
  applyAction(state: TState, action: TAction): TState;
  isGameOver(state: TState): boolean;
  getResult(state: TState): TResult;
  getPlayerView(state: TState, player: number): TPlayerView;
  computeAiMove?(state: TState, player: number): TAction | Promise<TAction>;
  getActivePlayer(state: TState): number;
}

export interface SessionState {
  id: string;
  gameSlug: string;
  state: unknown;
  config: unknown;
  createdAt: number;
}

export type ClientToServerMessage =
  | { type: "create-session"; gameSlug: string; config: unknown }
  | { type: "action"; sessionId: string; action: unknown }
  | { type: "leave-session"; sessionId: string };

export type ServerToClientMessage =
  | {
      type: "session-created";
      sessionId: string;
      playerView: unknown;
      legalActions: unknown[];
      phase: string;
    }
  | {
      type: "state-update";
      sessionId: string;
      playerView: unknown;
      legalActions: unknown[];
      activePlayer: number;
      phase: string;
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
