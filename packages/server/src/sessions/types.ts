import type { RoomSlot, RoomState } from "@boardgames/core/protocol/messages";

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
  // Solo session messages
  | { type: "create-session"; gameSlug: string; config: unknown }
  | { type: "action"; sessionId: string; action: unknown }
  | { type: "leave-session"; sessionId: string }
  // Room / lobby messages
  | { type: "create-room"; gameSlug: string; playerName: string }
  | { type: "join-room"; roomCode: string; playerName: string }
  | { type: "leave-room"; roomCode: string }
  | { type: "configure-room"; roomCode: string; slots: RoomSlot[] }
  | { type: "start-room"; roomCode: string; config: unknown }
  | { type: "kick-player"; roomCode: string; slotIndex: number }
  | { type: "toggle-ready"; roomCode: string };

export type ServerToClientMessage =
  // Session messages
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
      playerIndex?: number;
      phase: string;
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
