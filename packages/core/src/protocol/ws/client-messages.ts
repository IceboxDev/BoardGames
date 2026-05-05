import { z } from "zod";
import { GameSlugSchema } from "../common.ts";
import { RoomSlotSchema } from "./room.ts";

// ── Solo session ───────────────────────────────────────────────────────

const CreateSessionSchema = z.object({
  type: z.literal("create-session"),
  gameSlug: GameSlugSchema,
  config: z.unknown(),
});

const ActionSchema = z.object({
  type: z.literal("action"),
  sessionId: z.string(),
  action: z.unknown(),
});

const LeaveSessionSchema = z.object({
  type: z.literal("leave-session"),
  sessionId: z.string(),
});

// ── Room ───────────────────────────────────────────────────────────────

const CreateRoomSchema = z.object({
  type: z.literal("create-room"),
  gameSlug: GameSlugSchema,
  playerName: z.string(),
});

const JoinRoomSchema = z.object({
  type: z.literal("join-room"),
  roomCode: z.string(),
  playerName: z.string(),
});

const LeaveRoomSchema = z.object({
  type: z.literal("leave-room"),
  roomCode: z.string(),
});

const ConfigureRoomSchema = z.object({
  type: z.literal("configure-room"),
  roomCode: z.string(),
  slots: z.array(RoomSlotSchema),
});

const StartRoomSchema = z.object({
  type: z.literal("start-room"),
  roomCode: z.string(),
  config: z.unknown(),
});

const KickPlayerSchema = z.object({
  type: z.literal("kick-player"),
  roomCode: z.string(),
  slotIndex: z.number().int().min(0),
});

const ToggleReadySchema = z.object({
  type: z.literal("toggle-ready"),
  roomCode: z.string(),
});

// ── Discriminated union ────────────────────────────────────────────────

export const ClientMessageSchema = z.discriminatedUnion("type", [
  CreateSessionSchema,
  ActionSchema,
  LeaveSessionSchema,
  CreateRoomSchema,
  JoinRoomSchema,
  LeaveRoomSchema,
  ConfigureRoomSchema,
  StartRoomSchema,
  KickPlayerSchema,
  ToggleReadySchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export {
  ActionSchema,
  ConfigureRoomSchema,
  CreateRoomSchema,
  CreateSessionSchema,
  JoinRoomSchema,
  KickPlayerSchema,
  LeaveRoomSchema,
  LeaveSessionSchema,
  StartRoomSchema,
  ToggleReadySchema,
};
