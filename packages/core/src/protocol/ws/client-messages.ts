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

// Swap the in-game seats (roles) assigned to two slots — host only, before
// the game starts. Players stay in their slots; only `RoomState.seatOrder`
// changes (Sky Team: who flies as Pilot vs Co-Pilot).
const SwapSeatsSchema = z.object({
  type: z.literal("swap-seats"),
  roomCode: z.string(),
  a: z.number().int().min(0),
  b: z.number().int().min(0),
});

// Free-form chat between seated humans. Used during the Sky Team briefing
// phase (and other games that want pre-round discussion). The server
// rebroadcasts with the sender's slot + display name so clients don't
// have to trust client-supplied identity.
const ChatSchema = z.object({
  type: z.literal("chat"),
  roomCode: z.string(),
  text: z.string().min(1).max(500),
});

// Application-level liveness probe. The client sends this on an interval; the
// server answers with `{type:"pong"}`. It keeps an otherwise-idle lobby socket
// generating traffic (so the client's staleness check never false-trips) and
// lets the client detect a half-open connection when no pong comes back.
const PingSchema = z.object({
  type: z.literal("ping"),
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
  SwapSeatsSchema,
  ChatSchema,
  PingSchema,
]);
export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export {
  ActionSchema,
  ChatSchema,
  ConfigureRoomSchema,
  CreateRoomSchema,
  CreateSessionSchema,
  JoinRoomSchema,
  KickPlayerSchema,
  LeaveRoomSchema,
  LeaveSessionSchema,
  PingSchema,
  StartRoomSchema,
  SwapSeatsSchema,
  ToggleReadySchema,
};
