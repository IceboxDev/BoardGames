import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { persistenceRoutes } from "./persistence/routes.ts";
import { getRegisteredSlugs } from "./sessions/machine-registry.ts";
import { handleWsClose, handleWsMessage } from "./sessions/manager.ts";
import {
  handleConfigureRoom,
  handleCreateRoom,
  handleJoinRoom,
  handleKickPlayer,
  handleLeaveRoom,
  handleStartRoom,
  handleToggleReady,
} from "./sessions/room-manager.ts";
import type { ClientToServerMessage } from "./sessions/types.ts";
import { tournamentRoutes } from "./tournament/routes.ts";

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ ok: true, games: getRegisteredSlugs() }));

app.route("/api/tournaments", tournamentRoutes);
app.route("/api/games", persistenceRoutes);

function handleRoomMessage(ws: import("hono/ws").WSContext, msg: ClientToServerMessage): boolean {
  switch (msg.type) {
    case "create-room":
      handleCreateRoom(ws, msg);
      return true;
    case "join-room":
      handleJoinRoom(ws, msg);
      return true;
    case "leave-room":
      handleLeaveRoom(ws, msg);
      return true;
    case "configure-room":
      handleConfigureRoom(ws, msg);
      return true;
    case "start-room":
      handleStartRoom(ws, msg);
      return true;
    case "kick-player":
      handleKickPlayer(ws, msg);
      return true;
    case "toggle-ready":
      handleToggleReady(ws, msg);
      return true;
    default:
      return false;
  }
}

app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onMessage(event, ws) {
      const data = typeof event.data === "string" ? event.data : "";

      // Try room messages first
      try {
        const msg = JSON.parse(data) as ClientToServerMessage;
        if (handleRoomMessage(ws, msg)) return;
      } catch {
        // Fall through to session handler for error reporting
      }

      handleWsMessage(ws, data);
    },
    onClose(_event, ws) {
      handleWsClose(ws);
    },
  })),
);

export { app, injectWebSocket };
