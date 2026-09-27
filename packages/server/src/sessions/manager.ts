import { randomUUID } from "node:crypto";
import type { StartSeat } from "@boardgames/core/machines/seats";
import type { AnyGameMachineSpec } from "@boardgames/core/machines/types";
import type { WSContext } from "hono/ws";
import type { AnyActorRef } from "xstate";
import { createActor } from "xstate";
import { getServerGame } from "../games/registry.ts";
import { gameLog } from "../lib/game-log.ts";
import { saveMatch } from "../matches/store.ts";
import { handleRoomWsClose } from "./room-manager.ts";
import { prepareStart } from "./start.ts";
import type { ClientToServerMessage, ServerToClientMessage } from "./types.ts";

// Side-table populated at WS upgrade time after requireAuth runs: the account
// behind every socket. Seat ownership, reconnection and match history key off it.
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

/** A seat as this session knows it — the game's `StartSeat` plus who holds it. */
export type SessionSeat = StartSeat & {
  /** The account in a human seat; `null` for AI seats. */
  readonly userId: string | null;
  /** Display name for disconnect notices (rooms); `null` when unknown. */
  readonly name: string | null;
};

interface ActiveSession {
  id: string;
  actor: AnyActorRef;
  spec: AnyGameMachineSpec;
  gameSlug: string;
  seats: readonly SessionSeat[];
  seed: number;
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

function phaseOf(snapshot: ReturnType<AnyActorRef["getSnapshot"]>): string {
  return typeof snapshot.value === "string" ? snapshot.value : JSON.stringify(snapshot.value);
}

// ---------------------------------------------------------------------------
// Match persistence
// ---------------------------------------------------------------------------

/**
 * Save the finished game — its outcome, seed, log and who sat where. A game
 * that reports no outcome or log is a spec bug; it is logged, not saved.
 */
async function persistMatch(
  active: ActiveSession,
  snapshot: ReturnType<AnyActorRef["getSnapshot"]>,
): Promise<number | undefined> {
  const outcome = active.spec.getOutcome(snapshot);
  const log = active.spec.getReplayLog(snapshot);
  if (!outcome || log === null) {
    console.error(
      `[persistMatch] ${active.gameSlug}: game over without an outcome or replay log — NOT saved`,
    );
    return undefined;
  }
  const id = await saveMatch({
    gameSlug: active.gameSlug,
    seed: active.seed,
    outcome,
    log,
    seats: active.seats.map((seat) => ({
      kind: seat.kind,
      userId: seat.kind === "human" ? seat.userId : null,
      strategy: seat.kind === "ai" ? seat.strategy : null,
    })),
  });
  gameLog(active.gameSlug, active.id, "match saved", { id, outcome });
  return id;
}

// ---------------------------------------------------------------------------
// Session subscription — fan out state updates to all connected players
// ---------------------------------------------------------------------------

/**
 * Tear a session down and tell whoever is still connected why.
 *
 * Used for an explicit `leave-session`, the error path below, the end of a
 * room's reconnect grace and server shutdown, so a dying actor can never leave
 * orphaned entries in `sessions`.
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
  for (const p of active.players) wsSessions.get(p.ws)?.delete(active.id);
}

/** End a session by id — the room manager's hook when a room is finally closed. */
export function endSession(sessionId: string, reason?: string): void {
  const active = sessions.get(sessionId);
  if (active) destroySession(active, reason);
}

function subscribeSession(active: ActiveSession): void {
  let isFirstGameUpdate = true;

  const fail = (err: unknown, what: string): void => {
    console.error(`[session ${active.id}] ${active.gameSlug} ${what}:`, err);
    gameLog(active.gameSlug, active.id, "machine error", {
      message: err instanceof Error ? err.message : String(err),
    });
    destroySession(active, "The game hit an internal error and had to stop.");
  };

  const emit = (snapshot: ReturnType<ActiveSession["actor"]["getSnapshot"]>): void => {
    const phase = phaseOf(snapshot);
    if (phase === "idle") return;

    const activePlayer = active.spec.getActivePlayer(snapshot);
    gameLog(active.gameSlug, active.id, `→ ${phase}`, { activePlayer });

    if (active.spec.isGameOver(snapshot)) {
      const outcome = active.spec.getOutcome(snapshot);
      gameLog(active.gameSlug, active.id, "game over", { outcome });
      void (async () => {
        let replayId: number | undefined;
        try {
          replayId = await persistMatch(active, snapshot);
        } catch (err) {
          console.error(`[persistMatch] ${active.gameSlug} failed:`, err);
        }
        // Saving is a round trip to Turso. Everyone can have left meanwhile,
        // in which case the session is already gone — nothing to send.
        if (!sessions.has(active.id)) return;
        sendToAllPlayers(active, (p) => ({
          type: "game-over",
          sessionId: active.id,
          result: active.spec.getResult(snapshot),
          outcome,
          playerView: active.spec.getPlayerView(snapshot, p.playerIndex),
          playerIndex: p.playerIndex,
          replayId,
        }));
      })();
      return;
    }

    if (isFirstGameUpdate) {
      isFirstGameUpdate = false;
      if (!active.roomCode) {
        sendToAllPlayers(active, (p) => ({
          type: "session-created",
          sessionId: active.id,
          playerIndex: p.playerIndex,
          playerView: active.spec.getPlayerView(snapshot, p.playerIndex),
          legalActions: active.spec.getLegalActions(snapshot, p.playerIndex),
          activePlayer,
          phase,
        }));
      } else {
        sendToAllPlayers(active, (p) => ({
          type: "game-started",
          roomCode: active.roomCode ?? "",
          sessionId: active.id,
          playerIndex: p.playerIndex,
          activePlayer,
          playerView: active.spec.getPlayerView(snapshot, p.playerIndex),
          legalActions: active.spec.getLegalActions(snapshot, p.playerIndex),
          phase,
        }));
      }
      return;
    }

    if (active.seats[activePlayer]?.kind === "ai") {
      gameLog(active.gameSlug, active.id, "ai-thinking", { activePlayer });
      sendToAllPlayers(active, () => ({ type: "ai-thinking", sessionId: active.id }));
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
// Starting sessions
// ---------------------------------------------------------------------------

type StartResult =
  | { readonly ok: true; readonly sessionId: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Validate, build and start a game. Every session — solo or room — starts
 * here; the START event comes only from the game's `buildStart`.
 */
function startSession(params: {
  gameSlug: string;
  seats: readonly SessionSeat[];
  rawConfig: unknown;
  players: PlayerConnection[];
  roomCode?: string;
}): StartResult {
  const game = getServerGame(params.gameSlug);
  if (!game) return { ok: false, reason: `Unknown game: ${params.gameSlug}` };

  const prepared = prepareStart(game.spec, params.seats, params.rawConfig);
  if (!prepared.ok) return prepared;

  const active: ActiveSession = {
    id: generateId(),
    actor: createActor(game.createMachine()),
    spec: game.spec,
    gameSlug: params.gameSlug,
    seats: params.seats,
    seed: prepared.seed,
    players: params.players,
    ...(params.roomCode ? { roomCode: params.roomCode } : {}),
  };
  sessions.set(active.id, active);
  for (const p of active.players) {
    const set = wsSessions.get(p.ws) ?? new Set();
    set.add(active.id);
    wsSessions.set(p.ws, set);
  }

  gameLog(params.gameSlug, active.id, `session created (${params.roomCode ? "room" : "solo"})`, {
    seats: params.seats.map((s) => (s.kind === "ai" ? s.strategy : "human")),
    seed: prepared.seed,
  });
  subscribeSession(active);
  active.actor.start();
  active.actor.send(prepared.event);
  return { ok: true, sessionId: active.id };
}

function handleCreateSession(
  ws: WSContext,
  msg: Extract<ClientToServerMessage, { type: "create-session" }>,
): void {
  if ((wsSessions.get(ws)?.size ?? 0) >= MAX_SESSIONS_PER_SOCKET) {
    send(ws, { type: "error", message: "Too many open sessions on this connection" });
    return;
  }
  // The requesting socket holds every human seat of a solo game.
  const userId = wsAuth.get(ws) ?? null;
  const seats: SessionSeat[] = msg.seats.map((seat) =>
    seat.kind === "ai"
      ? { kind: "ai", strategy: seat.strategy, userId: null, name: null }
      : { kind: "human", userId, name: null },
  );
  const firstHuman = seats.findIndex((s) => s.kind === "human");
  const started = startSession({
    gameSlug: msg.gameSlug,
    seats,
    rawConfig: msg.config,
    players: [{ ws, playerIndex: Math.max(0, firstHuman), connected: true }],
  });
  if (!started.ok) send(ws, { type: "error", message: started.reason });
}

/** Start a room's game (called by the room manager with the seated room). */
export function startRoomSession(params: {
  gameSlug: string;
  seats: readonly SessionSeat[];
  players: PlayerConnection[];
  rawConfig: unknown;
  roomCode: string;
}): StartResult {
  return startSession(params);
}

// ---------------------------------------------------------------------------
// Reconnection (called by room-manager)
// ---------------------------------------------------------------------------

export function reconnectPlayer(sessionId: string, ws: WSContext, playerIndex: number): void {
  const active = sessions.get(sessionId);
  if (!active) return;

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
  if (active.spec.isGameOver(snapshot)) {
    send(ws, {
      type: "game-over",
      sessionId,
      result: active.spec.getResult(snapshot),
      outcome: active.spec.getOutcome(snapshot),
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
      phase: phaseOf(snapshot),
    });
  }

  for (const p of active.players) {
    if (p.playerIndex !== playerIndex && p.connected) {
      send(p.ws, {
        type: "player-reconnected",
        sessionId,
        playerIndex,
        playerName: active.seats[playerIndex]?.name ?? "",
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
  const seat = resolveSeat(active, player, msg.action.player);

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

  active.actor.send(validated.event);
  // A machine mid-beat (an AI's pause, a reveal) does not take moves; say so
  // rather than let the click vanish.
  if (active.actor.getSnapshot() === snapshot) {
    send(ws, { type: "error", sessionId: active.id, message: "Not yet — try that move again" });
  }
}

/**
 * Which seat is this action played for?
 *
 * Rooms: always the authenticated seat — a client cannot name another.
 * Solo: the socket holds every human seat (Pandemic solo plays all roles, Sky
 * Team solo can fly both seats), so an explicitly claimed seat is honoured —
 * but only a human one; the AI seats are the machine's.
 */
function resolveSeat(
  active: ActiveSession,
  player: PlayerConnection,
  claimed: number | undefined,
): number {
  if (active.roomCode || claimed === undefined) return player.playerIndex;
  return active.seats[claimed]?.kind === "human" ? claimed : player.playerIndex;
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
    destroySession(active);
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

/**
 * A socket went away. A solo game ends with it. A room game only marks the
 * seat disconnected: the room manager owns the room's lifetime, keeps it open
 * through a reconnect grace period and ends the session with `endSession`.
 */
export function handleWsClose(ws: WSContext): void {
  handleRoomWsClose(ws);

  const sessionIds = wsSessions.get(ws);
  if (!sessionIds) return;
  for (const id of [...sessionIds]) {
    const active = sessions.get(id);
    if (!active) continue;
    if (!active.roomCode) {
      destroySession(active);
      continue;
    }
    const player = active.players.find((p) => p.ws === ws);
    if (!player) continue;
    player.connected = false;
    for (const p of active.players) {
      if (!p.connected) continue;
      send(p.ws, {
        type: "player-disconnected",
        sessionId: id,
        playerIndex: player.playerIndex,
        playerName: active.seats[player.playerIndex]?.name ?? "",
      });
    }
  }
  wsSessions.delete(ws);
}
