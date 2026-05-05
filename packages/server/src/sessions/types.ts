// Wire-protocol shapes live in `@boardgames/core/protocol` so that server
// and web cannot drift. The local aliases keep the existing call-site names
// (ClientToServerMessage / ServerToClientMessage) stable.
export type {
  ClientMessage as ClientToServerMessage,
  ServerMessage as ServerToClientMessage,
} from "@boardgames/core/protocol";

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
