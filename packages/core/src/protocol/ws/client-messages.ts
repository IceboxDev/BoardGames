import { z } from "zod";
import { SeatRequestSchema } from "../../machines/seats.ts";
import { GameSlugSchema } from "../common.ts";
import { RoomSlotSchema } from "./room.ts";

// ── Solo session ───────────────────────────────────────────────────────

/**
 * Start a solo game. `seats` lists who sits where — the requesting socket
 * holds every human seat — and `config` carries the game's options. Both are
 * checked on the server against the game's manifest before anything starts;
 * the START event itself is built server-side, never taken from the client.
 */
/**
 * The most seats any game's table has (Clocktower: a Storyteller and 20).
 * Only a payload bound — the game's manifest decides the real range.
 */
export const MAX_SOLO_SEATS = 21;

const CreateSessionSchema = z.object({
  type: z.literal("create-session"),
  gameSlug: GameSlugSchema,
  seats: z.array(SeatRequestSchema).min(1).max(MAX_SOLO_SEATS),
  /** Game options; parsed by the game's `manifest.config` on the server. */
  config: z.unknown(),
});

/**
 * One move, in the one shape every game accepts: `action` is one of the moves
 * the game listed in `legalActions` (the game's validator matches it against
 * its own list). `player` claims a seat — honoured only in a solo game, where
 * one person holds several human seats (Pandemic's roles); a room seat always
 * comes from the socket.
 */
export const PlayerActionEnvelopeSchema = z.object({
  type: z.literal("PLAYER_ACTION"),
  action: z.unknown(),
  player: z.number().int().min(0).optional(),
});
export type PlayerActionEnvelope = z.infer<typeof PlayerActionEnvelopeSchema>;

const ActionSchema = z.object({
  type: z.literal("action"),
  sessionId: z.string(),
  action: PlayerActionEnvelopeSchema,
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
  /** Game options; parsed by the game's `manifest.config`. Seats come from the room. */
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

// Swap the in-game seats (roles) assigned to two slots before the game starts.
// The host may swap any two; anyone else may swap only their own slot with an
// AI-held one (taking that seat). Players stay in their slots; only
// `RoomState.seatOrder` changes (Sky Team: Pilot vs Co-Pilot; Codenames: who
// is a spymaster, and on which team).
const SwapSeatsSchema = z.object({
  type: z.literal("swap-seats"),
  roomCode: z.string(),
  a: z.number().int().min(0),
  b: z.number().int().min(0),
});

// Host only, before the game starts: deal the filled seats out at random.
const ShuffleSeatsSchema = z.object({
  type: z.literal("shuffle-seats"),
  roomCode: z.string(),
});

// Host only, once a room's game is over: play again at the same table with
// the same options. `rotateBy` moves every filled seat that many places down
// the seat order first (Codenames: 2, so each team's next operative becomes
// its spymaster); 0 keeps the seats.
const RematchRoomSchema = z.object({
  type: z.literal("rematch-room"),
  roomCode: z.string(),
  rotateBy: z.number().int().min(0).max(31).default(0),
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
  ShuffleSeatsSchema,
  RematchRoomSchema,
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
  RematchRoomSchema,
  ShuffleSeatsSchema,
  StartRoomSchema,
  SwapSeatsSchema,
  ToggleReadySchema,
};
