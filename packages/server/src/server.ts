import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth.ts";
import { adminOnlineRoutes } from "./auth-routes/admin-online.ts";
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

const webOrigin = process.env.WEB_ORIGIN;
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3001",
  "http://127.0.0.1:5173",
  ...(webOrigin ? [webOrigin] : []),
];

app.use(
  "/api/*",
  cors({
    origin: allowedOrigins,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/api/auth-config", (c) =>
  c.json({ googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID) }),
);

app.get("/api/health", (c) => c.json({ ok: true, games: getRegisteredSlugs() }));

app.route("/api/admin/users", adminOnlineRoutes);
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
