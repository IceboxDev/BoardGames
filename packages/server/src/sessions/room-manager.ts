import type { RoomSlot, RoomState } from "@boardgames/core/protocol/messages";
import { gameRoomConfigs } from "@boardgames/core/protocol/room-config";
import type { WSContext } from "hono/ws";
import { getMachineSpec } from "./machine-registry.ts";
import { createMultiClientSession, type PlayerConnection, reconnectPlayer } from "./manager.ts";

// ---------------------------------------------------------------------------
// Room code generation
// ---------------------------------------------------------------------------

// Exclude ambiguous characters: O, I, L
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ";

function generateRoomCode(): string {
  let code: string;
  do {
    code = "";
    for (let i = 0; i < 4; i++) {
      code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    }
  } while (rooms.has(code));
  return code;
}

// ---------------------------------------------------------------------------
// Room data
// ---------------------------------------------------------------------------

interface Room {
  code: string;
  gameSlug: string;
  hostWs: WSContext;
  slots: RoomSlot[];
  clients: Map<WSContext, number>; // ws → slotIndex
  sessionId: string | null; // set once game starts
}

const rooms = new Map<string, Room>();
const wsToRoom = new Map<WSContext, string>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function send(ws: WSContext, msg: unknown): void {
  ws.send(JSON.stringify(msg));
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
  };
}

function sendError(ws: WSContext, message: string): void {
  send(ws, { type: "error", message });
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export function handleCreateRoom(
  ws: WSContext,
  msg: { gameSlug: string; playerName: string },
): void {
  // Validate game exists
  const spec = getMachineSpec(msg.gameSlug);
  if (!spec) {
    sendError(ws, `Unknown game: ${msg.gameSlug}`);
    return;
  }

  const config = gameRoomConfigs[msg.gameSlug];
  if (!config) {
    sendError(ws, `Game ${msg.gameSlug} does not support multiplayer`);
    return;
  }

  // Leave any existing room first
  const existingRoom = wsToRoom.get(ws);
  if (existingRoom) {
    handleLeaveRoom(ws, { roomCode: existingRoom });
  }

  const code = generateRoomCode();
  const slots: RoomSlot[] = [];

  // Host is slot 0
  slots.push({
    kind: "human",
    playerName: msg.playerName,
    ready: true, // host is always ready
    connected: true,
  });

  // Fill remaining slots as open
  for (let i = 1; i < config.maxPlayers; i++) {
    slots.push({ kind: "open", ready: false, connected: false });
  }

  const room: Room = {
    code,
    gameSlug: msg.gameSlug,
    hostWs: ws,
    slots,
    clients: new Map([[ws, 0]]),
    sessionId: null,
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

  if (room.sessionId) {
    // Game already started — check for reconnection
    handleReconnect(ws, room, msg.playerName);
    return;
  }

  // Leave any existing room first
  const existingJoinRoom = wsToRoom.get(ws);
  if (existingJoinRoom) {
    handleLeaveRoom(ws, { roomCode: existingJoinRoom });
  }

  // Find first open slot
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
  room.clients.set(ws, slotIndex);
  wsToRoom.set(ws, room.code);

  // Send join confirmation to the joining player
  send(ws, {
    type: "room-joined",
    roomCode: room.code,
    roomState: buildRoomState(room),
    yourSlot: slotIndex,
  });

  // Broadcast update to all players
  broadcastRoomUpdate(room);
}

function handleReconnect(ws: WSContext, room: Room, playerName: string): void {
  // Find the disconnected slot with matching name
  const slotIndex = room.slots.findIndex(
    (s) => s.kind === "human" && !s.connected && s.playerName === playerName,
  );
  if (slotIndex === -1) {
    sendError(ws, "Cannot reconnect: no matching slot");
    return;
  }

  room.slots[slotIndex].connected = true;
  room.clients.set(ws, slotIndex);
  wsToRoom.set(ws, room.code);

  broadcastRoomUpdate(room);

  // Signal the session manager to send current game state to this player
  if (room.sessionId) {
    reconnectPlayer(room.sessionId, ws, slotIndex);
  }
}

export function handleLeaveRoom(ws: WSContext, msg: { roomCode: string }): void {
  const room = rooms.get(msg.roomCode);
  if (!room) return;

  const slotIndex = room.clients.get(ws);
  if (slotIndex === undefined) return;

  room.clients.delete(ws);
  wsToRoom.delete(ws);

  // If host left, close the room
  if (slotIndex === 0) {
    closeRoom(room, "Host left the room");
    return;
  }

  // Free the slot
  room.slots[slotIndex] = { kind: "open", ready: false, connected: false };
  broadcastRoomUpdate(room);
}

export function handleConfigureRoom(
  ws: WSContext,
  msg: { roomCode: string; slots: RoomSlot[] },
): void {
  const room = rooms.get(msg.roomCode);
  if (!room) {
    sendError(ws, `Room ${msg.roomCode} not found`);
    return;
  }

  // Only host can configure
  if (room.hostWs !== ws) {
    sendError(ws, "Only the host can configure the room");
    return;
  }

  if (room.sessionId) {
    sendError(ws, "Cannot configure after game has started");
    return;
  }

  // Preserve connected human players — only update slots that match
  for (let i = 0; i < msg.slots.length && i < room.slots.length; i++) {
    const current = room.slots[i];
    const incoming = msg.slots[i];

    if (current.kind === "human" && current.connected && incoming.kind !== "human") {
      // Kick the connected player from this slot
      for (const [clientWs, idx] of room.clients) {
        if (idx === i && clientWs !== room.hostWs) {
          send(clientWs, {
            type: "room-closed",
            roomCode: room.code,
            reason: "You were removed from the room",
          });
          room.clients.delete(clientWs);
          wsToRoom.delete(clientWs);
          break;
        }
      }
    }

    room.slots[i] = incoming;
  }

  // Resize if needed
  if (msg.slots.length !== room.slots.length) {
    room.slots.length = msg.slots.length;
    for (let i = room.slots.length; i < msg.slots.length; i++) {
      room.slots.push(msg.slots[i]);
    }
  }

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
  if (msg.slotIndex === 0) {
    sendError(ws, "Cannot kick yourself");
    return;
  }

  const slot = room.slots[msg.slotIndex];
  if (!slot || slot.kind !== "human") return;

  // Find and disconnect the kicked player
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

  const roomConfig = gameRoomConfigs[room.gameSlug];
  if (!roomConfig) {
    sendError(ws, "Game does not support multiplayer");
    return;
  }

  // Count human players and check readiness
  const humanSlots = room.slots.filter((s) => s.kind === "human");
  if (humanSlots.length < roomConfig.minPlayers) {
    sendError(ws, `Need at least ${roomConfig.minPlayers} players`);
    return;
  }

  const unready = room.slots.find((s) => s.kind === "human" && !s.ready && s.connected);
  if (unready) {
    sendError(ws, "Not all players are ready");
    return;
  }

  // Build player connections for the session
  const players: PlayerConnection[] = [];
  for (let i = 0; i < room.slots.length; i++) {
    const slot = room.slots[i];
    if (slot.kind === "human") {
      // Find the ws for this slot
      for (const [clientWs, idx] of room.clients) {
        if (idx === i) {
          players.push({ ws: clientWs, playerIndex: i, connected: true });
          break;
        }
      }
    }
    // AI slots don't have a ws connection — handled by the machine
  }

  // Build game-specific config from room state
  const gameConfig = buildGameConfig(room, msg.config as Record<string, unknown>);

  // Create the multi-client session
  const sessionId = createMultiClientSession(room.gameSlug, players, gameConfig, room.code);

  room.sessionId = sessionId;
}

function buildGameConfig(room: Room, extra: Record<string, unknown>): Record<string, unknown> {
  switch (room.gameSlug) {
    case "lost-cities": {
      // 2 players — if both human, pass humanPlayers: [0, 1]
      const humanIndices = room.slots
        .map((s, i) => (s.kind === "human" ? i : -1))
        .filter((i) => i >= 0);
      const aiSlot = room.slots.find((s) => s.kind === "ai");
      return {
        aiEngine: aiSlot?.aiStrategy ?? "ismcts-v4",
        humanPlayers: humanIndices,
        ...extra,
      };
    }

    case "exploding-kittens": {
      // Map slots to strategies array: null for human, strategy ID for AI
      const strategies = room.slots
        .filter((s) => s.kind !== "open")
        .map((s) => (s.kind === "ai" ? (s.aiStrategy ?? "heuristic-v1") : null));
      return {
        playerCount: strategies.length,
        strategies,
        ...extra,
      };
    }

    case "pandemic": {
      const humanCount = room.slots.filter((s) => s.kind === "human").length;
      return {
        config: {
          numPlayers: humanCount,
          difficulty: (extra.difficulty as number) ?? 4,
        },
      };
    }

    case "durak": {
      const strategies = room.slots
        .filter((s) => s.kind !== "open")
        .map((s) => (s.kind === "ai" ? (s.aiStrategy ?? "heuristic-v1") : null));
      return {
        playerCount: strategies.length,
        strategies,
        ...extra,
      };
    }

    case "sushi-go": {
      const humanCount = room.slots.filter((s) => s.kind === "human").length;
      return { playerCount: humanCount, ...extra };
    }

    default:
      return extra;
  }
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

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

function closeRoom(room: Room, reason: string): void {
  for (const clientWs of room.clients.keys()) {
    send(clientWs, { type: "room-closed", roomCode: room.code, reason });
    wsToRoom.delete(clientWs);
  }
  rooms.delete(room.code);
}

export function handleRoomWsClose(ws: WSContext): void {
  const roomCode = wsToRoom.get(ws);
  if (!roomCode) return;

  const room = rooms.get(roomCode);
  if (!room) {
    wsToRoom.delete(ws);
    return;
  }

  const slotIndex = room.clients.get(ws);
  if (slotIndex === undefined) {
    wsToRoom.delete(ws);
    return;
  }

  if (room.sessionId) {
    // Game is in progress — mark disconnected, don't destroy
    room.slots[slotIndex].connected = false;
    room.clients.delete(ws);
    wsToRoom.delete(ws);
    broadcastRoomUpdate(room);

    // Check if all players disconnected
    const anyConnected = room.slots.some((s) => s.kind === "human" && s.connected);
    if (!anyConnected) {
      rooms.delete(room.code);
    }
  } else {
    // Still in lobby
    handleLeaveRoom(ws, { roomCode });
  }
}
