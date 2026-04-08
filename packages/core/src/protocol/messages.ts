// ---------------------------------------------------------------------------
// Room / lobby types
// ---------------------------------------------------------------------------

export interface RoomSlot {
  kind: "human" | "ai" | "open";
  playerName?: string;
  aiStrategy?: string;
  ready: boolean;
  connected: boolean;
}

export interface RoomState {
  gameSlug: string;
  hostName: string;
  slots: RoomSlot[];
}

// ---------------------------------------------------------------------------
// Client → Server messages
// ---------------------------------------------------------------------------

export type ClientMessage =
  // Existing session messages (solo play)
  | { type: "create-session"; gameSlug: string; config: unknown }
  | { type: "player-action"; sessionId: string; action: unknown }
  | { type: "leave-session"; sessionId: string }
  // Room / lobby messages
  | { type: "create-room"; gameSlug: string; playerName: string }
  | { type: "join-room"; roomCode: string; playerName: string }
  | { type: "leave-room"; roomCode: string }
  | { type: "configure-room"; roomCode: string; slots: RoomSlot[] }
  | { type: "start-room"; roomCode: string; config: unknown }
  | { type: "kick-player"; roomCode: string; slotIndex: number };

// ---------------------------------------------------------------------------
// Server → Client messages
// ---------------------------------------------------------------------------

export type ServerMessage =
  // Existing session messages
  | {
      type: "session-created";
      sessionId: string;
      view: unknown;
      legalActions: unknown[];
      phase: string;
    }
  | {
      type: "state-update";
      sessionId: string;
      view: unknown;
      legalActions: unknown[];
      phase: string;
      activePlayer: number;
      playerIndex?: number;
    }
  | { type: "ai-thinking"; sessionId: string }
  | {
      type: "game-over";
      sessionId: string;
      result: unknown;
      view: unknown;
      replayId?: number;
      playerIndex?: number;
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
