import type { GameMachineSpec } from "@boardgames/core/machines/types";
import type { WSContext } from "hono/ws";
import type { AnyActorRef } from "xstate";
import { createActor } from "xstate";
import { getDb } from "../db.ts";
import { getMachineSpec } from "./machine-registry.ts";
import type { ClientToServerMessage, ServerToClientMessage } from "./types.ts";

let nextId = 1;

function generateId(): string {
  return `session-${Date.now()}-${nextId++}`;
}

interface ActiveSession {
  id: string;
  actor: AnyActorRef;
  spec: GameMachineSpec<any, any, any, any>;
  ws: WSContext;
  gameSlug: string;
  config: Record<string, unknown>;
}

const sessions = new Map<string, ActiveSession>();
const wsSessions = new Map<WSContext, Set<string>>();

function send(ws: WSContext, msg: ServerToClientMessage): void {
  ws.send(JSON.stringify(msg));
}

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
  const playerIndex = 0;

  const config = msg.config as Record<string, unknown>;
  const active: ActiveSession = { id, actor, spec, ws, gameSlug: msg.gameSlug, config };
  sessions.set(id, active);

  const wsSet = wsSessions.get(ws) ?? new Set();
  wsSet.add(id);
  wsSessions.set(ws, wsSet);

  let isFirstGameUpdate = true;

  actor.subscribe((snapshot) => {
    const phase =
      typeof snapshot.value === "string" ? snapshot.value : JSON.stringify(snapshot.value);

    if (phase === "idle") return;

    if (spec.isGameOver(snapshot)) {
      let replayId: number | undefined;

      if (spec.getReplayLog) {
        try {
          const log = spec.getReplayLog(snapshot) as { scoreA?: number; scoreB?: number } | null;
          if (log) {
            const result = spec.getResult(snapshot) as { winner?: unknown } | null;
            const winner = result?.winner === 0 ? "p0" : result?.winner === 1 ? "p1" : "draw";
            const db = getDb();
            const info = db
              .prepare(
                "INSERT INTO session_replays (game_slug, ai_engine, replay_json, score_p0, score_p1, winner) VALUES (?, ?, ?, ?, ?, ?)",
              )
              .run(
                active.gameSlug,
                (active.config.aiEngine as string) ?? null,
                JSON.stringify(log),
                log.scoreA ?? null,
                log.scoreB ?? null,
                winner,
              );
            replayId = Number(info.lastInsertRowid);
          }
        } catch (err) {
          console.error("Failed to persist replay:", err);
        }
      }

      send(ws, {
        type: "game-over",
        sessionId: id,
        result: spec.getResult(snapshot),
        playerView: spec.getPlayerView(snapshot, playerIndex),
        replayId,
      });
      return;
    }

    if (isFirstGameUpdate) {
      isFirstGameUpdate = false;
      send(ws, {
        type: "session-created",
        sessionId: id,
        playerView: spec.getPlayerView(snapshot, playerIndex),
        legalActions: spec.getLegalActions(snapshot, playerIndex),
        phase,
      });
      return;
    }

    const activePlayer = spec.getActivePlayer(snapshot);

    if (activePlayer !== playerIndex) {
      send(ws, { type: "ai-thinking", sessionId: id });
    }

    send(ws, {
      type: "state-update",
      sessionId: id,
      playerView: spec.getPlayerView(snapshot, playerIndex),
      legalActions: spec.getLegalActions(snapshot, playerIndex),
      activePlayer,
      phase,
    });
  });

  actor.start();
  actor.send({ type: "START", ...config });
}

function handleAction(
  ws: WSContext,
  msg: Extract<ClientToServerMessage, { type: "action" }>,
): void {
  const active = sessions.get(msg.sessionId);
  if (!active) {
    send(ws, { type: "error", sessionId: msg.sessionId, message: "Session not found" });
    return;
  }
  if (active.ws !== ws) {
    send(ws, { type: "error", sessionId: msg.sessionId, message: "Not your session" });
    return;
  }

  try {
    active.actor.send(msg.action as any);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid action";
    send(ws, { type: "error", sessionId: active.id, message });
  }
}

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
      send(ws, { type: "error", message: "Unknown message type" });
  }
}

export function handleWsClose(ws: WSContext): void {
  const sessionIds = wsSessions.get(ws);
  if (sessionIds) {
    for (const id of sessionIds) {
      const active = sessions.get(id);
      if (active) {
        active.actor.stop();
        sessions.delete(id);
      }
    }
    wsSessions.delete(ws);
  }
}
