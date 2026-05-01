import type { GameMachineSpec } from "@boardgames/core/machines/types";
import type { WSContext } from "hono/ws";
import type { AnyActorLogic, AnyActorRef } from "xstate";
import { createActor } from "xstate";
import { getDb } from "../db.ts";
import { getMachineSpec } from "./machine-registry.ts";
import { handleRoomWsClose } from "./room-manager.ts";
import type { ClientToServerMessage, ServerToClientMessage } from "./types.ts";

// Side-table populated at WS upgrade time after requireAuth runs.
// Future work (e.g. reconnection by user id, per-session ownership checks)
// reads from here. Today nothing in the protocol layer consumes it yet.
const wsUserIds = new Map<WSContext, string>();
export const wsAuth = {
  set(ws: WSContext, userId: string): void {
    wsUserIds.set(ws, userId);
  },
  delete(ws: WSContext): void {
    wsUserIds.delete(ws);
  },
  get(ws: WSContext): string | undefined {
    return wsUserIds.get(ws);
  },
};

let nextId = 1;

function generateId(): string {
  return `session-${Date.now()}-${nextId++}`;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PlayerConnection {
  ws: WSContext;
  playerIndex: number;
  connected: boolean;
}

interface ActiveSession {
  id: string;
  actor: AnyActorRef;
  spec: GameMachineSpec<AnyActorLogic, unknown, unknown, unknown>;
  gameSlug: string;
  config: Record<string, unknown>;
  players: PlayerConnection[];
  roomCode?: string;
}

const sessions = new Map<string, ActiveSession>();
const wsSessions = new Map<WSContext, Set<string>>();

// ---------------------------------------------------------------------------
// Send helpers
// ---------------------------------------------------------------------------

function send(ws: WSContext, msg: ServerToClientMessage): void {
  ws.send(JSON.stringify(msg));
}

function sendToAllPlayers(
  active: ActiveSession,
  buildMsg: (p: PlayerConnection) => ServerToClientMessage,
): void {
  for (const player of active.players) {
    if (!player.connected) continue;
    send(player.ws, buildMsg(player));
  }
}

// ---------------------------------------------------------------------------
// Replay persistence
// ---------------------------------------------------------------------------

async function persistReplay(
  active: ActiveSession,
  snapshot: ReturnType<ActiveSession["actor"]["getSnapshot"]>,
): Promise<number | undefined> {
  if (!active.spec.getReplayLog) return undefined;
  const log = active.spec.getReplayLog(snapshot) as {
    scoreA?: number;
    scoreB?: number;
    scores?: number[];
    playerCount?: number;
    durak?: number | null;
  } | null;
  if (!log) return undefined;

  const result = active.spec.getResult(snapshot) as {
    winner?: unknown;
    durak?: unknown;
  } | null;

  let winner: string;
  if (log.durak !== undefined && log.durak !== null) {
    winner = `p${log.durak}`;
  } else if (result?.winner === 0) {
    winner = "p0";
  } else if (result?.winner === 1) {
    winner = "p1";
  } else {
    winner = "draw";
  }

  const aiEngine =
    (active.config.aiEngine as string | undefined) ??
    (active.config.strategies as (string | null)[] | undefined)?.find((s) => s !== null) ??
    null;

  const info = await getDb().execute({
    sql: "INSERT INTO session_replays (game_slug, ai_engine, replay_json, score_p0, score_p1, winner, scores_json, player_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    args: [
      active.gameSlug,
      aiEngine,
      JSON.stringify(log),
      log.scoreA ?? null,
      log.scoreB ?? null,
      winner,
      log.scores ? JSON.stringify(log.scores) : null,
      log.playerCount ?? null,
    ],
  });
  return Number(info.lastInsertRowid);
}

// ---------------------------------------------------------------------------
// Session subscription — fan out state updates to all connected players
// ---------------------------------------------------------------------------

function subscribeSession(active: ActiveSession): void {
  let isFirstGameUpdate = true;

  active.actor.subscribe((snapshot) => {
    const phase =
      typeof snapshot.value === "string" ? snapshot.value : JSON.stringify(snapshot.value);

    if (phase === "idle") return;

    if (active.spec.isGameOver(snapshot)) {
      void (async () => {
        let replayId: number | undefined;
        if (active.spec.getReplayLog) {
          try {
            replayId = await persistReplay(active, snapshot);
          } catch (err) {
            console.error("Failed to persist replay:", err);
          }
        }
        sendToAllPlayers(active, (p) => ({
          type: "game-over",
          sessionId: active.id,
          result: active.spec.getResult(snapshot),
          playerView: active.spec.getPlayerView(snapshot, p.playerIndex),
          playerIndex: p.playerIndex,
          replayId,
        }));
      })();
      return;
    }

    if (isFirstGameUpdate) {
      isFirstGameUpdate = false;

      // For room-based games, game-started is sent by room-manager
      // For solo sessions, send session-created
      if (!active.roomCode) {
        sendToAllPlayers(active, (p) => ({
          type: "session-created",
          sessionId: active.id,
          playerView: active.spec.getPlayerView(snapshot, p.playerIndex),
          legalActions: active.spec.getLegalActions(snapshot, p.playerIndex),
          phase,
        }));
      } else {
        // For room-based games, send game-started to each player
        sendToAllPlayers(active, (p) => ({
          type: "game-started",
          roomCode: active.roomCode ?? "",
          sessionId: active.id,
          playerIndex: p.playerIndex,
          activePlayer: active.spec.getActivePlayer(snapshot),
          playerView: active.spec.getPlayerView(snapshot, p.playerIndex),
          legalActions: active.spec.getLegalActions(snapshot, p.playerIndex),
          phase,
        }));
      }
      return;
    }

    const activePlayer = active.spec.getActivePlayer(snapshot);

    // Check if the active player is an AI (no ws connection for that index)
    const activeHasWs = active.players.some((p) => p.playerIndex === activePlayer);
    if (!activeHasWs) {
      sendToAllPlayers(active, (_p) => ({
        type: "ai-thinking",
        sessionId: active.id,
      }));
    }

    sendToAllPlayers(active, (p) => ({
      type: "state-update",
      sessionId: active.id,
      playerView: active.spec.getPlayerView(snapshot, p.playerIndex),
      legalActions: active.spec.getLegalActions(snapshot, p.playerIndex),
      activePlayer,
      playerIndex: p.playerIndex,
      phase,
    }));
  });
}

// ---------------------------------------------------------------------------
// Solo session creation (backwards-compatible)
// ---------------------------------------------------------------------------

function handleCreateSession(
  ws: WSContext,
  msg: Extract<ClientToServerMessage, { type: "create-session" }>,
): void {
  const spec = getMachineSpec(msg.gameSlug);
  if (!spec) {
    send(ws, { type: "error", message: `Unknown game: ${msg.gameSlug}` });
    return;
  }

  const id = generateId();
  const actor = createActor(spec.machine);
  const config = msg.config as Record<string, unknown>;

  const active: ActiveSession = {
    id,
    actor,
    spec,
    gameSlug: msg.gameSlug,
    config,
    players: [{ ws, playerIndex: 0, connected: true }],
  };
  sessions.set(id, active);

  const wsSet = wsSessions.get(ws) ?? new Set();
  wsSet.add(id);
  wsSessions.set(ws, wsSet);

  subscribeSession(active);

  actor.start();
  actor.send({ type: "START", ...config });
}

// ---------------------------------------------------------------------------
// Multi-client session creation (called by room-manager)
// ---------------------------------------------------------------------------

export function createMultiClientSession(
  gameSlug: string,
  players: PlayerConnection[],
  config: Record<string, unknown>,
  roomCode: string,
): string {
  const spec = getMachineSpec(gameSlug);
  if (!spec) throw new Error(`Unknown game: ${gameSlug}`);

  const id = generateId();
  const actor = createActor(spec.machine);

  const active: ActiveSession = {
    id,
    actor,
    spec,
    gameSlug,
    config,
    players,
    roomCode,
  };
  sessions.set(id, active);

  // Track ws → session for all players
  for (const p of players) {
    const wsSet = wsSessions.get(p.ws) ?? new Set();
    wsSet.add(id);
    wsSessions.set(p.ws, wsSet);
  }

  subscribeSession(active);

  actor.start();
  actor.send({ type: "START", ...config });

  return id;
}

// ---------------------------------------------------------------------------
// Reconnection (called by room-manager)
// ---------------------------------------------------------------------------

export function reconnectPlayer(sessionId: string, ws: WSContext, playerIndex: number): void {
  const active = sessions.get(sessionId);
  if (!active) return;

  // Update or add the player connection
  const existing = active.players.find((p) => p.playerIndex === playerIndex);
  if (existing) {
    existing.ws = ws;
    existing.connected = true;
  } else {
    active.players.push({ ws, playerIndex, connected: true });
  }

  const wsSet = wsSessions.get(ws) ?? new Set();
  wsSet.add(sessionId);
  wsSessions.set(ws, wsSet);

  // Send current state to the reconnecting player
  const snapshot = active.actor.getSnapshot();
  const phase =
    typeof snapshot.value === "string" ? snapshot.value : JSON.stringify(snapshot.value);

  if (active.spec.isGameOver(snapshot)) {
    send(ws, {
      type: "game-over",
      sessionId,
      result: active.spec.getResult(snapshot),
      playerView: active.spec.getPlayerView(snapshot, playerIndex),
      playerIndex,
    });
  } else {
    send(ws, {
      type: "state-update",
      sessionId,
      playerView: active.spec.getPlayerView(snapshot, playerIndex),
      legalActions: active.spec.getLegalActions(snapshot, playerIndex),
      activePlayer: active.spec.getActivePlayer(snapshot),
      playerIndex,
      phase,
    });
  }

  // Notify other players
  for (const p of active.players) {
    if (p.playerIndex !== playerIndex && p.connected) {
      send(p.ws, {
        type: "player-reconnected",
        sessionId,
        playerIndex,
        playerName: "",
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Action handling — with turn validation for multi-client
// ---------------------------------------------------------------------------

function handleAction(
  ws: WSContext,
  msg: Extract<ClientToServerMessage, { type: "action" }>,
): void {
  const active = sessions.get(msg.sessionId);
  if (!active) {
    send(ws, { type: "error", sessionId: msg.sessionId, message: "Session not found" });
    return;
  }

  // Find this player
  const player = active.players.find((p) => p.ws === ws);
  if (!player) {
    send(ws, { type: "error", sessionId: msg.sessionId, message: "Not your session" });
    return;
  }

  // For multi-client sessions, validate it's this player's turn
  if (active.players.length > 1) {
    const snapshot = active.actor.getSnapshot();
    const activePlayer = active.spec.getActivePlayer(snapshot);
    if (activePlayer === -1) {
      // Simultaneous play — inject playerIndex, skip turn validation
      try {
        active.actor.send({
          ...(msg.action as Record<string, unknown>),
          playerIndex: player.playerIndex,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Invalid action";
        send(ws, { type: "error", sessionId: active.id, message });
      }
      return;
    }
    if (activePlayer !== player.playerIndex) {
      send(ws, { type: "error", sessionId: msg.sessionId, message: "Not your turn" });
      return;
    }
  }

  try {
    active.actor.send(msg.action as Record<string, unknown>);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid action";
    send(ws, { type: "error", sessionId: active.id, message });
  }
}

// ---------------------------------------------------------------------------
// Session cleanup
// ---------------------------------------------------------------------------

function handleLeaveSession(
  _ws: WSContext,
  msg: Extract<ClientToServerMessage, { type: "leave-session" }>,
): void {
  const active = sessions.get(msg.sessionId);
  if (active) {
    active.actor.stop();
    sessions.delete(msg.sessionId);
  }
}

// ---------------------------------------------------------------------------
// Message routing
// ---------------------------------------------------------------------------

export function handleWsMessage(ws: WSContext, raw: string): void {
  let msg: ClientToServerMessage;
  try {
    msg = JSON.parse(raw) as ClientToServerMessage;
  } catch {
    send(ws, { type: "error", message: "Invalid JSON" });
    return;
  }

  switch (msg.type) {
    case "create-session":
      handleCreateSession(ws, msg);
      break;
    case "action":
      handleAction(ws, msg);
      break;
    case "leave-session":
      handleLeaveSession(ws, msg);
      break;
    default:
      // Room messages are handled by the room manager — delegate from server.ts
      return;
  }
}

export function handleWsClose(ws: WSContext): void {
  // Handle room disconnection
  handleRoomWsClose(ws);

  const sessionIds = wsSessions.get(ws);
  if (sessionIds) {
    for (const id of sessionIds) {
      const active = sessions.get(id);
      if (!active) continue;

      if (active.roomCode) {
        // Multi-client: mark player as disconnected
        const player = active.players.find((p) => p.ws === ws);
        if (player) {
          player.connected = false;

          // Notify remaining players
          for (const p of active.players) {
            if (p.connected) {
              send(p.ws, {
                type: "player-disconnected",
                sessionId: id,
                playerIndex: player.playerIndex,
                playerName: "",
              });
            }
          }

          // Destroy only if all players disconnected
          const anyConnected = active.players.some((p) => p.connected);
          if (!anyConnected) {
            active.actor.stop();
            sessions.delete(id);
          }
        }
      } else {
        // Solo session: destroy immediately
        active.actor.stop();
        sessions.delete(id);
      }
    }
    wsSessions.delete(ws);
  }
}
