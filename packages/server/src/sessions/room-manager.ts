import { randomBytes } from "node:crypto";
import { getManifest } from "@boardgames/core/games/manifests";
import {
  defaultStrategyFor,
  type GameManifest,
  strategiesFor,
} from "@boardgames/core/machines/manifest";
import { type RoomSlot, type RoomState, roomSeating } from "@boardgames/core/protocol";
import type { WSContext } from "hono/ws";
import {
  endSession,
  endSoloSessionsForWs,
  type PlayerConnection,
  reconnectPlayer,
  type SessionSeat,
  startRoomSession,
  wsAuth,
} from "./manager.ts";

// ---------------------------------------------------------------------------
// Room code generation
// ---------------------------------------------------------------------------

// Exclude ambiguous characters: O, I, L
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ";
const CODE_LENGTH = 6;

/**
 * How long a started room waits for anyone to come back once every person in
 * it has disconnected — a refresh, a phone locking, a flaky connection —
 * before the game is ended and the room closed.
 */
export const ROOM_RECONNECT_GRACE_MS = 120_000;

/**
 * Room codes are a capability — possessing one lets you take a seat — so they
 * are generated with a CSPRNG, not `Math.random()`. V8's xorshift128+ state is
 * recoverable from a handful of observed outputs, which would have made every
 * subsequent code predictable.
 *
 * Six characters over a 23-symbol alphabet is ~148M codes (the previous four
 * gave ~280k, walkable in seconds).
 */
function generateRoomCode(): string {
  let code: string;
  do {
    const bytes = randomBytes(CODE_LENGTH);
    code = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
      // Modulo bias is negligible here (256 % 23 = 3) and codes are not secrets
      // in the cryptographic sense — unguessability at this scale is enough.
      code += CODE_CHARS[(bytes[i] as number) % CODE_CHARS.length];
    }
  } while (rooms.has(code));
  return code;
}

// ---------------------------------------------------------------------------
// Room data
// ---------------------------------------------------------------------------

export interface Room {
  code: string;
  gameSlug: string;
  hostWs: WSContext;
  /** One slot per possible seat (`manifest.seats.max`); the count never changes. */
  slots: RoomSlot[];
  clients: Map<WSContext, number>; // ws → slotIndex
  /** slotIndex → authenticated userId that owns the seat (server-side only,
   *  never sent over the wire). Reconnection and seat ownership key off this,
   *  NOT the client-supplied playerName — otherwise anyone who knows a room
   *  code + a player's display name could hijack their seat and read their
   *  private hand. `undefined` for open/AI slots. */
  slotUserIds: (string | undefined)[];
  /** Seat rank per slot. Identity until the host swaps roles (Sky Team:
   *  seat 0 = Pilot, seat 1 = Co-Pilot); see `roomSeating`. */
  seatOrder: number[];
  sessionId: string | null; // set once game starts
  /** slotIndex → in-game seat, fixed when the game starts. */
  seatOfSlot: (number | undefined)[];
  /** Ends the game if nobody has come back — armed while no person is connected. */
  graceTimer: ReturnType<typeof setTimeout> | null;
}

const rooms = new Map<string, Room>();
const wsToRoom = new Map<WSContext, string>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function send(ws: WSContext, msg: unknown): void {
  if (ws.readyState !== 1 /* OPEN */) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch (err) {
    console.error("[room] send failed:", err);
  }
}

function broadcastRoomUpdate(room: Room): void {
  const state = buildRoomState(room);
  for (const ws of room.clients.keys()) {
    send(ws, { type: "room-updated", roomCode: room.code, roomState: state });
  }
}

function buildRoomState(room: Room): RoomState {
  return {
    gameSlug: room.gameSlug,
    hostName: room.slots[0]?.playerName ?? "",
    slots: room.slots,
    seatOrder: room.seatOrder,
  };
}

function sendError(ws: WSContext, message: string): void {
  send(ws, { type: "error", message });
}

/**
 * The seats a room starts with, in in-game order (`roomSeating`), and the slot
 * each seat came from. An AI slot with no strategy, or one not offered at this
 * table size, takes the manifest's default for the size. Exported for tests.
 */
export function seatRoom(
  room: Pick<Room, "slots" | "seatOrder" | "slotUserIds">,
  manifest: GameManifest,
): { seats: SessionSeat[]; slotOfSeat: number[] } {
  const slotOfSeat = roomSeating(room.slots, room.seatOrder);
  const offered = new Set(strategiesFor(manifest, slotOfSeat.length).map((s) => s.id));
  const fallback = defaultStrategyFor(manifest, slotOfSeat.length);
  const seats = slotOfSeat.map((slotIndex): SessionSeat => {
    const slot = room.slots[slotIndex];
    if (slot?.kind === "ai") {
      const strategy =
        slot.aiStrategy && offered.has(slot.aiStrategy) ? slot.aiStrategy : (fallback ?? "");
      return { kind: "ai", strategy, userId: null, name: null };
    }
    return {
      kind: "human",
      userId: room.slotUserIds[slotIndex] ?? null,
      name: slot?.playerName ?? null,
    };
  });
  return { seats, slotOfSeat };
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export function handleCreateRoom(
  ws: WSContext,
  msg: { gameSlug: string; playerName: string },
): void {
  // The socket is authenticated at upgrade (requireWsAuth); the resolved
  // userId owns the host seat. Refuse if it's somehow missing rather than
  // creating an unowned room.
  const userId = wsAuth.get(ws);
  if (!userId) {
    sendError(ws, "Not authenticated");
    return;
  }

  const manifest = getManifest(msg.gameSlug);
  if (!manifest) {
    sendError(ws, `Unknown game: ${msg.gameSlug}`);
    return;
  }

  // Leave any existing room first
  const existingRoom = wsToRoom.get(ws);
  if (existingRoom) {
    handleLeaveRoom(ws, { roomCode: existingRoom });
  }

  // A dangling solo game can't coexist with a room game on one socket —
  // the client gates this with an explicit "abandon solo?" prompt; this
  // covers direct-URL entries that skip the prompt.
  endSoloSessionsForWs(ws);

  const code = generateRoomCode();
  const size = manifest.seats.max;
  const slots: RoomSlot[] = [
    // Host is slot 0 and always ready.
    { kind: "human", playerName: msg.playerName, ready: true, connected: true },
    ...Array.from(
      { length: size - 1 },
      (): RoomSlot => ({
        kind: "open",
        ready: false,
        connected: false,
      }),
    ),
  ];
  const slotUserIds: (string | undefined)[] = new Array(size).fill(undefined);
  slotUserIds[0] = userId;

  const room: Room = {
    code,
    gameSlug: msg.gameSlug,
    hostWs: ws,
    slots,
    clients: new Map([[ws, 0]]),
    slotUserIds,
    seatOrder: Array.from({ length: size }, (_, i) => i),
    sessionId: null,
    seatOfSlot: [],
    graceTimer: null,
  };

  rooms.set(code, room);
  wsToRoom.set(ws, code);

  send(ws, {
    type: "room-created",
    roomCode: code,
    roomState: buildRoomState(room),
  });
}

export function handleJoinRoom(ws: WSContext, msg: { roomCode: string; playerName: string }): void {
  const room = rooms.get(msg.roomCode);
  if (!room) {
    sendError(ws, `Room ${msg.roomCode} not found`);
    return;
  }

  const userId = wsAuth.get(ws);
  if (!userId) {
    sendError(ws, "Not authenticated");
    return;
  }

  if (room.sessionId) {
    // Game already started — check for reconnection (matched by userId).
    handleReconnect(ws, room, userId);
    return;
  }

  // One seat per user: if this account already holds a slot in the room,
  // don't hand it a second one (also stops a second tab from shadow-joining).
  if (room.slotUserIds.includes(userId)) {
    sendError(ws, "You are already in this room");
    return;
  }

  // Leave any existing room first
  const existingJoinRoom = wsToRoom.get(ws);
  if (existingJoinRoom) {
    handleLeaveRoom(ws, { roomCode: existingJoinRoom });
  }

  // Same solo-session cleanup as create-room (see comment there).
  endSoloSessionsForWs(ws);

  const slotIndex = room.slots.findIndex((s) => s.kind === "open");
  if (slotIndex === -1) {
    sendError(ws, "Room is full");
    return;
  }

  room.slots[slotIndex] = {
    kind: "human",
    playerName: msg.playerName,
    ready: false,
    connected: true,
  };
  room.slotUserIds[slotIndex] = userId;
  room.clients.set(ws, slotIndex);
  wsToRoom.set(ws, room.code);

  send(ws, {
    type: "room-joined",
    roomCode: room.code,
    roomState: buildRoomState(room),
    yourSlot: slotIndex,
  });
  broadcastRoomUpdate(room);
}

function handleReconnect(ws: WSContext, room: Room, userId: string): void {
  // Find the disconnected slot owned by THIS authenticated user. Matching on
  // userId (not the client-supplied playerName) is what prevents a stranger
  // who knows the room code + a display name from stealing the seat and its
  // private player view.
  const slotIndex = room.slots.findIndex(
    (s, i) => s.kind === "human" && !s.connected && room.slotUserIds[i] === userId,
  );
  const seat = room.seatOfSlot[slotIndex];
  if (slotIndex === -1 || seat === undefined) {
    sendError(ws, "Cannot reconnect: no seat in this game belongs to you");
    return;
  }

  const slot = room.slots[slotIndex];
  if (slot.kind === "human") slot.connected = true;
  room.clients.set(ws, slotIndex);
  wsToRoom.set(ws, room.code);
  cancelGrace(room);

  broadcastRoomUpdate(room);
  if (room.sessionId) reconnectPlayer(room.sessionId, ws, seat);
}

/** A player leaves. Before the game their slot opens; during it, they may come back. */
export function handleLeaveRoom(ws: WSContext, msg: { roomCode: string }): void {
  const room = rooms.get(msg.roomCode);
  if (!room) return;

  const slotIndex = room.clients.get(ws);
  if (slotIndex === undefined) return;

  room.clients.delete(ws);
  wsToRoom.delete(ws);

  if (room.sessionId) {
    // Mid-game the seat stays theirs (they can rejoin with the code); the room
    // lives on while anyone is still at the table.
    markDisconnected(room, slotIndex);
    return;
  }

  if (slotIndex === 0) {
    closeRoom(room, "Host left the room");
    return;
  }

  room.slots[slotIndex] = { kind: "open", ready: false, connected: false };
  room.slotUserIds[slotIndex] = undefined;
  broadcastRoomUpdate(room);
}

/**
 * Host-only: set which slots are open or AI (and each AI's strategy). The
 * table size is the manifest's and never changes; people only arrive by
 * joining, so a slot can become human only by already being one.
 */
export function handleConfigureRoom(
  ws: WSContext,
  msg: { roomCode: string; slots: RoomSlot[] },
): void {
  const room = rooms.get(msg.roomCode);
  if (!room) {
    sendError(ws, `Room ${msg.roomCode} not found`);
    return;
  }
  if (room.hostWs !== ws) {
    sendError(ws, "Only the host can configure the room");
    return;
  }
  if (room.sessionId) {
    sendError(ws, "Cannot configure after game has started");
    return;
  }
  if (msg.slots.length !== room.slots.length) {
    sendError(ws, `This room has ${room.slots.length} seats`);
    return;
  }

  for (let i = 1; i < room.slots.length; i++) {
    const current = room.slots[i];
    const incoming = msg.slots[i];
    if (!current || !incoming) continue;

    if (current.kind === "human") {
      if (incoming.kind === "human") continue; // people keep their own slot state
      // The host turned a person's slot into AI/open: remove them.
      for (const [clientWs, idx] of room.clients) {
        if (idx !== i) continue;
        send(clientWs, {
          type: "room-closed",
          roomCode: room.code,
          reason: "You were removed from the room",
        });
        room.clients.delete(clientWs);
        wsToRoom.delete(clientWs);
      }
    }

    room.slotUserIds[i] = undefined;
    room.slots[i] =
      incoming.kind === "ai"
        ? {
            kind: "ai",
            ...(incoming.aiStrategy ? { aiStrategy: incoming.aiStrategy } : {}),
            ready: true,
            connected: false,
          }
        : { kind: "open", ready: false, connected: false };
  }

  broadcastRoomUpdate(room);
}

/**
 * Swap the in-game seats (roles) assigned to two slots — host only, before
 * the game starts. Players never change slots (host identity, kick rules,
 * and ready state all key off slot index); only `seatOrder` changes, so
 * "who flies as Pilot" is decoupled from "who created the room".
 */
export function handleSwapSeats(
  ws: WSContext,
  msg: { roomCode: string; a: number; b: number },
): void {
  const room = rooms.get(msg.roomCode);
  if (!room) {
    sendError(ws, `Room ${msg.roomCode} not found`);
    return;
  }
  if (room.hostWs !== ws) {
    sendError(ws, "Only the host can swap seats");
    return;
  }
  if (room.sessionId) {
    sendError(ws, "Cannot swap seats after game has started");
    return;
  }
  const { a, b } = msg;
  if (a === b || a >= room.seatOrder.length || b >= room.seatOrder.length) {
    sendError(ws, "Invalid seat swap");
    return;
  }
  [room.seatOrder[a], room.seatOrder[b]] = [room.seatOrder[b], room.seatOrder[a]];
  broadcastRoomUpdate(room);
}

export function handleKickPlayer(
  ws: WSContext,
  msg: { roomCode: string; slotIndex: number },
): void {
  const room = rooms.get(msg.roomCode);
  if (!room) return;
  if (room.hostWs !== ws) {
    sendError(ws, "Only the host can kick players");
    return;
  }
  if (room.sessionId) {
    sendError(ws, "Cannot kick after the game has started");
    return;
  }
  if (msg.slotIndex === 0) {
    sendError(ws, "Cannot kick yourself");
    return;
  }

  const slot = room.slots[msg.slotIndex];
  if (!slot || slot.kind !== "human") return;

  for (const [clientWs, idx] of room.clients) {
    if (idx === msg.slotIndex) {
      send(clientWs, {
        type: "room-closed",
        roomCode: room.code,
        reason: "You were kicked from the room",
      });
      room.clients.delete(clientWs);
      wsToRoom.delete(clientWs);
      break;
    }
  }

  room.slots[msg.slotIndex] = { kind: "open", ready: false, connected: false };
  room.slotUserIds[msg.slotIndex] = undefined;
  broadcastRoomUpdate(room);
}

export function handleStartRoom(ws: WSContext, msg: { roomCode: string; config: unknown }): void {
  const room = rooms.get(msg.roomCode);
  if (!room) {
    sendError(ws, `Room ${msg.roomCode} not found`);
    return;
  }
  if (room.hostWs !== ws) {
    sendError(ws, "Only the host can start the game");
    return;
  }
  if (room.sessionId) {
    sendError(ws, "Game already started");
    return;
  }
  const manifest = getManifest(room.gameSlug);
  if (!manifest) {
    sendError(ws, `Unknown game: ${room.gameSlug}`);
    return;
  }

  const humans = room.slots.flatMap((s, i) => (s.kind === "human" ? [i] : []));
  if (humans.some((i) => !room.slots[i]?.connected)) {
    sendError(ws, "A player has disconnected — wait for them or free their seat");
    return;
  }
  if (humans.some((i) => !room.slots[i]?.ready)) {
    sendError(ws, "Not all players are ready");
    return;
  }

  // Seats count humans AND AI against the manifest; the host's options are
  // parsed by the game's own schema inside `startRoomSession`.
  const { seats, slotOfSeat } = seatRoom(room, manifest);
  const players: PlayerConnection[] = [];
  for (const [clientWs, slotIndex] of room.clients) {
    const seat = slotOfSeat.indexOf(slotIndex);
    if (seat >= 0) players.push({ ws: clientWs, playerIndex: seat, connected: true });
  }

  const started = startRoomSession({
    gameSlug: room.gameSlug,
    seats,
    players,
    rawConfig: msg.config,
    roomCode: room.code,
  });
  if (!started.ok) {
    sendError(ws, started.reason);
    return;
  }
  room.sessionId = started.sessionId;
  room.seatOfSlot = [];
  slotOfSeat.forEach((slotIndex, seat) => {
    room.seatOfSlot[slotIndex] = seat;
  });
}

// ---------------------------------------------------------------------------
// Toggle ready
// ---------------------------------------------------------------------------

export function handleToggleReady(ws: WSContext, msg: { roomCode: string }): void {
  const room = rooms.get(msg.roomCode);
  if (!room) return;

  const slotIndex = room.clients.get(ws);
  if (slotIndex === undefined) return;

  // Host is always ready
  if (slotIndex === 0) return;

  const slot = room.slots[slotIndex];
  if (slot.kind === "human") {
    slot.ready = !slot.ready;
    broadcastRoomUpdate(room);
  }
}

// Rebroadcast a chat message to every seat in the room. The server stamps
// the sender's slot + display name so clients can't forge identity, and
// `timestampMs` for stable ordering when client clocks drift.
export function handleChat(ws: WSContext, msg: { roomCode: string; text: string }): void {
  const room = rooms.get(msg.roomCode);
  if (!room) return;
  const slotIndex = room.clients.get(ws);
  if (slotIndex === undefined) return;
  const slot = room.slots[slotIndex];
  if (slot.kind !== "human") return;

  const text = msg.text.trim();
  if (!text) return;

  const payload = {
    type: "chat-message" as const,
    roomCode: room.code,
    fromSlot: slotIndex,
    fromName: slot.playerName,
    // Cap to the schema's 500-char limit defensively; the validator
    // already rejected longer messages but trimming may have changed
    // length within the bound.
    text: text.slice(0, 500),
    timestampMs: Date.now(),
  };
  for (const clientWs of room.clients.keys()) {
    send(clientWs, payload);
  }
}

// ---------------------------------------------------------------------------
// Lifetime
// ---------------------------------------------------------------------------

function closeRoom(room: Room, reason: string): void {
  cancelGrace(room);
  for (const clientWs of room.clients.keys()) {
    send(clientWs, { type: "room-closed", roomCode: room.code, reason });
    wsToRoom.delete(clientWs);
  }
  rooms.delete(room.code);
  if (room.sessionId) endSession(room.sessionId);
}

function cancelGrace(room: Room): void {
  if (room.graceTimer) clearTimeout(room.graceTimer);
  room.graceTimer = null;
}

/** A seated player dropped out of a started game; arm the grace timer if nobody is left. */
function markDisconnected(room: Room, slotIndex: number): void {
  const slot = room.slots[slotIndex];
  if (slot) slot.connected = false;
  broadcastRoomUpdate(room);

  const anyoneConnected = room.slots.some((s) => s.kind === "human" && s.connected);
  if (anyoneConnected || room.graceTimer) return;
  room.graceTimer = setTimeout(() => {
    room.graceTimer = null;
    closeRoom(room, "Everyone left the game");
  }, ROOM_RECONNECT_GRACE_MS);
  room.graceTimer.unref?.();
}

export function handleRoomWsClose(ws: WSContext): void {
  const roomCode = wsToRoom.get(ws);
  if (!roomCode) return;
  const room = rooms.get(roomCode);
  if (!room) {
    wsToRoom.delete(ws);
    return;
  }

  // In the lobby a dropped connection is a leave: the slot frees up (or the
  // room closes if it was the host's).
  if (!room.sessionId) {
    handleLeaveRoom(ws, { roomCode });
    return;
  }

  const slotIndex = room.clients.get(ws);
  room.clients.delete(ws);
  wsToRoom.delete(ws);
  if (slotIndex !== undefined) markDisconnected(room, slotIndex);
}

/** Test hook: forget every room. */
export function resetRoomsForTests(): void {
  for (const room of rooms.values()) cancelGrace(room);
  rooms.clear();
  wsToRoom.clear();
}
