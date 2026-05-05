import { z } from "zod";
import { GameSlugSchema } from "../common.ts";
import { RoomSlotSchema, RoomStateSchema } from "./room.ts";

// ── Solo session messages ──────────────────────────────────────────────
//
// Per-game `playerView`, `legalActions`, and `result` shapes stay `unknown`
// at the envelope; per-game schemas ship in a follow-up. The discriminator
// is `type` and zod's `discriminatedUnion` narrows on that.

const SessionCreatedSchema = z.object({
  type: z.literal("session-created"),
  sessionId: z.string(),
  playerView: z.unknown(),
  legalActions: z.array(z.unknown()),
  phase: z.string(),
});

const StateUpdateSchema = z.object({
  type: z.literal("state-update"),
  sessionId: z.string(),
  playerView: z.unknown(),
  legalActions: z.array(z.unknown()),
  activePlayer: z.number().int().min(0),
  playerIndex: z.number().int().min(0).optional(),
  phase: z.string(),
});

const AiThinkingSchema = z.object({
  type: z.literal("ai-thinking"),
  sessionId: z.string(),
});

const GameOverSchema = z.object({
  type: z.literal("game-over"),
  sessionId: z.string(),
  result: z.unknown(),
  playerView: z.unknown(),
  playerIndex: z.number().int().min(0).optional(),
  replayId: z.number().int().optional(),
});

const ErrorSchema = z.object({
  type: z.literal("error"),
  sessionId: z.string().optional(),
  message: z.string(),
});

// ── Room / lobby messages ──────────────────────────────────────────────

const RoomCreatedSchema = z.object({
  type: z.literal("room-created"),
  roomCode: z.string(),
  roomState: RoomStateSchema,
});

const RoomJoinedSchema = z.object({
  type: z.literal("room-joined"),
  roomCode: z.string(),
  roomState: RoomStateSchema,
  yourSlot: z.number().int().min(0),
});

const RoomUpdatedSchema = z.object({
  type: z.literal("room-updated"),
  roomCode: z.string(),
  roomState: RoomStateSchema,
});

const RoomClosedSchema = z.object({
  type: z.literal("room-closed"),
  roomCode: z.string(),
  reason: z.string(),
});

const GameStartedSchema = z.object({
  type: z.literal("game-started"),
  roomCode: z.string(),
  sessionId: z.string(),
  playerIndex: z.number().int().min(0),
  activePlayer: z.number().int().min(0),
  playerView: z.unknown(),
  legalActions: z.array(z.unknown()),
  phase: z.string(),
});

const PlayerDisconnectedSchema = z.object({
  type: z.literal("player-disconnected"),
  sessionId: z.string(),
  playerIndex: z.number().int().min(0),
  playerName: z.string(),
});

const PlayerReconnectedSchema = z.object({
  type: z.literal("player-reconnected"),
  sessionId: z.string(),
  playerIndex: z.number().int().min(0),
  playerName: z.string(),
});

// ── Discriminated union ────────────────────────────────────────────────

export const ServerMessageSchema = z.discriminatedUnion("type", [
  SessionCreatedSchema,
  StateUpdateSchema,
  AiThinkingSchema,
  GameOverSchema,
  ErrorSchema,
  RoomCreatedSchema,
  RoomJoinedSchema,
  RoomUpdatedSchema,
  RoomClosedSchema,
  GameStartedSchema,
  PlayerDisconnectedSchema,
  PlayerReconnectedSchema,
]);
export type ServerMessage = z.infer<typeof ServerMessageSchema>;

// Re-export individual variant schemas for typed builders on the server.
// `GameSlugSchema` is re-exported for callers that need to validate slugs
// before constructing messages.
export {
  AiThinkingSchema,
  ErrorSchema,
  GameOverSchema,
  GameSlugSchema,
  GameStartedSchema,
  PlayerDisconnectedSchema,
  PlayerReconnectedSchema,
  RoomClosedSchema,
  RoomCreatedSchema,
  RoomJoinedSchema,
  RoomSlotSchema,
  RoomStateSchema,
  RoomUpdatedSchema,
  SessionCreatedSchema,
  StateUpdateSchema,
};
