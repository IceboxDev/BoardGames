export type ClientMessage =
  | { type: "create-session"; gameSlug: string; config: unknown }
  | { type: "player-action"; sessionId: string; action: unknown }
  | { type: "leave-session"; sessionId: string };

export type ServerMessage =
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
    }
  | { type: "ai-thinking"; sessionId: string }
  | { type: "game-over"; sessionId: string; result: unknown; view: unknown }
  | { type: "error"; sessionId?: string; message: string };
