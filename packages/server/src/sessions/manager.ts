import { randomUUID } from "node:crypto";
import type { GameMachineSpec } from "@boardgames/core/machines/types";
import type { WSContext } from "hono/ws";
import type { AnyActorLogic, AnyActorRef } from "xstate";
import { createActor } from "xstate";
import { getDb } from "../db.ts";
import { gameLog } from "../lib/game-log.ts";
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

/**
 * Session ids must be UNGUESSABLE, not merely unique. They used to be
 * `session-${Date.now()}-${counter}`, which any client could enumerate — and
 * `leave-session` acted on the id alone, so walking the space terminated every
 * game on the server. Ownership is enforced below too; this closes the
 * enumeration half.
 */
function generateId(): string {
  return `session-${randomUUID()}`;
}

/**
 * A socket only ever renders one game at a time, so this is generous. It caps
 * the memory an authenticated client can allocate by looping `create-session`,
 * which previously had no bound at all.
 */
const MAX_SESSIONS_PER_SOCKET = 8;

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
  // A closed or closing socket still accepts `send()` in some ws builds and
  // throws in others; either way the write is pointless. Checking keeps a
  // teardown race from turning into an exception on the emit path.
  if (ws.readyState !== 1 /* OPEN */) return;
  try {
    ws.send(JSON.stringify(msg));
  } catch (err) {
    console.error("[ws] send failed:", err);
  }
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
  if (!active.spec.getReplayLog) {
    console.warn(`[persistReplay] ${active.gameSlug}: spec has no getReplayLog — replay NOT saved`);
    return undefined;
  }
  const log = active.spec.getReplayLog(snapshot) as {
    scoreA?: number;
    scoreB?: number;
    scores?: number[];
    playerCount?: number;
    durak?: number | null;
  } | null;
  if (!log) {
    console.warn(
      `[persistReplay] ${active.gameSlug}: getReplayLog returned null — replay NOT saved`,
    );
    return undefined;
  }

  const result = active.spec.getResult(snapshot) as {
    winner?: unknown;
    durak?: unknown;
    outcome?: unknown;
  } | null;

  let winner: string;
  if (log.durak !== undefined && log.durak !== null) {
    winner = `p${log.durak}`;
  } else if (result?.winner === 0) {
    winner = "p0";
  } else if (result?.winner === 1) {
    winner = "p1";
  } else if (typeof result?.outcome === "string") {
    // Cooperative games (Sky Team, Pandemic) report a single outcome string
    // instead of a winning player index — "win" means the team landed, anything
    // starting with "loss-" means the team didn't. Map both onto the same
    // p0/p1 buckets the match-history table already understands so the row
    // shows up as Win/Loss rather than getting swallowed as a draw nobody
    // bothered to display.
    winner = result.outcome === "win" ? "p0" : "p1";
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
  const id = Number(info.lastInsertRowid);
  console.log(
    `[persistReplay] ${active.gameSlug} id=${id} winner=${winner} ai=${aiEngine ?? "human"}`,
  );
  return id;
}

// ---------------------------------------------------------------------------
// Session subscription — fan out state updates to all connected players
// ---------------------------------------------------------------------------

/**
 * Tear a session down and tell whoever is still connected why.
 *
 * Used both for an explicit `leave-session` and for the error path below,
 * so a dying actor can never leave orphaned entries in `sessions`.
 */
function destroySession(active: ActiveSession, reason?: string): void {
  if (reason) {
    sendToAllPlayers(active, () => ({
      type: "error",
      sessionId: active.id,
      message: reason,
    }));
  }
  try {
    active.actor.stop();
  } catch (err) {
    console.error(`[session ${active.id}] actor.stop() threw during teardown:`, err);
  }
  sessions.delete(active.id);
  for (const ids of wsSessions.values()) ids.delete(active.id);
}

function subscribeSession(active: ActiveSession): void {
  let isFirstGameUpdate = true;

  // An OBSERVER OBJECT, not a bare function. With no `error` handler XState
  // re-raises a failed transition on a macrotask (`setTimeout(() => { throw
  // err })`), which is an uncaught exception — one bad action used to kill the
  // process and every concurrent game with it. Supplying `error` keeps the
  // blast radius at this one session.
  const fail = (err: unknown, what: string): void => {
    console.error(`[session ${active.id}] ${active.gameSlug} ${what}:`, err);
    gameLog(active.gameSlug, active.id, "machine error", {
      message: err instanceof Error ? err.message : String(err),
    });
    destroySession(active, "The game hit an internal error and had to stop.");
  };

  const emit = (snapshot: ReturnType<ActiveSession["actor"]["getSnapshot"]>): void => {
    const phase =
      typeof snapshot.value === "string" ? snapshot.value : JSON.stringify(snapshot.value);

    if (phase === "idle") return;

    const activePlayer = active.spec.getActivePlayer(snapshot);
    gameLog(active.gameSlug, active.id, `→ ${phase}`, { activePlayer });

    if (active.spec.isGameOver(snapshot)) {
      gameLog(active.gameSlug, active.id, "game over", { result: active.spec.getResult(snapshot) });
      void (async () => {
        let replayId: number | undefined;
        if (active.spec.getReplayLog) {
          try {
            replayId = await persistReplay(active, snapshot);
          } catch (err) {
            console.error("Failed to persist replay:", err);
          }
        }
        // Persisting the replay is a round trip to Turso. Everyone can have
        // disconnected in the meantime, in which case `handleWsClose` already
        // stopped the actor and dropped the session — sending here would be a
        // write to closed sockets.
        if (!sessions.has(active.id)) return;
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

    // Check if the active player is an AI (no ws connection for that index)
    const activeHasWs = active.players.some((p) => p.playerIndex === activePlayer);
    if (!activeHasWs) {
      gameLog(active.gameSlug, active.id, "ai-thinking", { activePlayer });
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
  };

  // An OBSERVER OBJECT, not a bare function. With no `error` handler XState
  // re-raises a failed transition on a macrotask (`setTimeout(() => { throw
  // err })`) — an uncaught exception that used to take down the process and
  // every concurrent game with it. Supplying `error` keeps the blast radius at
  // this one session. `next` is wrapped for the same reason: the player-view
  // projection runs inside the observer, and a throw there escapes identically.
  active.actor.subscribe({
    next: (snapshot) => {
      try {
        emit(snapshot);
      } catch (err) {
        fail(err, "failed to project a snapshot");
      }
    },
    error: (err) => fail(err, "machine transition failed"),
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

  const existing = wsSessions.get(ws)?.size ?? 0;
  if (existing >= MAX_SESSIONS_PER_SOCKET) {
    send(ws, { type: "error", message: "Too many open sessions on this connection" });
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

  gameLog(msg.gameSlug, id, "session created (solo)", { config });
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

  gameLog(active.gameSlug, active.id, "client action", {
    player: player.playerIndex,
    action: msg.action,
  });

  const snapshot = active.actor.getSnapshot();
  const seat = resolveSeat(active, player, msg.action);

  // Turn validation for multi-client sessions. `-1` means simultaneous play,
  // where every seat may act at once.
  if (active.players.length > 1) {
    const activePlayer = active.spec.getActivePlayer(snapshot);
    if (activePlayer !== -1 && activePlayer !== player.playerIndex) {
      send(ws, { type: "error", sessionId: msg.sessionId, message: "Not your turn" });
      return;
    }
  }

  // The spec turns the untrusted payload into a machine event, or refuses.
  // Nothing client-controlled reaches `actor.send` any more: validators built
  // on `playerActionValidator` hand back an event carrying the ENGINE's own
  // legal-action object.
  const validated = active.spec.validateAction(snapshot, seat, msg.action);
  if (!validated.ok) {
    gameLog(active.gameSlug, active.id, "action rejected", { reason: validated.reason });
    send(ws, { type: "error", sessionId: active.id, message: validated.reason });
    return;
  }

  active.actor.send(validated.event as Parameters<typeof active.actor.send>[0]);
}

/**
 * Which seat is this action played for?
 *
 * Multiplayer: always the authenticated seat — a client cannot name another.
 * Solo: the socket owns the entire table (co-op games such as Sky Team drive
 * several seats from one client, and Pandemic solo plays every role), so an
 * explicitly requested seat is honoured. There is no one to impersonate.
 */
function resolveSeat(active: ActiveSession, player: PlayerConnection, raw: unknown): number {
  if (active.players.length > 1) return player.playerIndex;
  if (typeof raw !== "object" || raw === null) return player.playerIndex;
  const claimed =
    (raw as Record<string, unknown>).player ?? (raw as Record<string, unknown>).playerIndex;
  return typeof claimed === "number" && Number.isInteger(claimed) && claimed >= 0
    ? claimed
    : player.playerIndex;
}

// ---------------------------------------------------------------------------
// Session cleanup
// ---------------------------------------------------------------------------

function handleLeaveSession(
  ws: WSContext,
  msg: Extract<ClientToServerMessage, { type: "leave-session" }>,
): void {
  const active = sessions.get(msg.sessionId);
  if (!active) return;

  // Only a socket actually seated in this session may end it. This used to
  // act on the id alone, so any authenticated socket — or any web page, via
  // the unauthenticated WebSocket upgrade — could terminate every game on the
  // server by walking the id space.
  if (!active.players.some((p) => p.ws === ws)) {
    send(ws, { type: "error", sessionId: msg.sessionId, message: "Not your session" });
    return;
  }

  destroySession(active);
}

/**
 * Stop any SOLO sessions still bound to this socket. Called by the room
 * manager when the socket creates or joins a room: solo and room games
 * can't run side by side on one connection (the client renders a single
 * shared view), so a dangling solo game would keep emitting state-updates
 * into the room game's UI. The client prompts the user before reaching
 * this point; this is the server-side guarantee for direct-URL paths.
 */
export function endSoloSessionsForWs(ws: WSContext): void {
  const ids = wsSessions.get(ws);
  if (!ids) return;
  for (const id of [...ids]) {
    const active = sessions.get(id);
    if (!active || active.roomCode) continue;
    gameLog(active.gameSlug, active.id, "solo session ended (socket entered a room)");
    active.actor.stop();
    sessions.delete(id);
    ids.delete(id);
  }
}

// ---------------------------------------------------------------------------
// Message routing
// ---------------------------------------------------------------------------

export function handleWsMessage(ws: WSContext, msg: ClientToServerMessage): void {
  // Caller is responsible for envelope validation (see server.ts → parseClientMessage).
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

/**
 * Stop every live session, telling players why. Used by the SIGTERM path so a
 * deploy produces an explicit "server restarting" message instead of sockets
 * that simply go dark and a board that silently freezes.
 *
 * Live games do not survive a restart — actors are process memory and are
 * never snapshotted. Draining is the honest version of that, not a fix for it.
 */
export function shutdownAllSessions(reason: string): number {
  const count = sessions.size;
  for (const active of [...sessions.values()]) destroySession(active, reason);
  return count;
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
