import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./auth.ts";
import {
  adminAvailabilityAllRoutes,
  adminAvailabilityRoutes,
} from "./auth-routes/admin-availability.ts";
import { adminInventoryRoutes } from "./auth-routes/admin-inventory.ts";
import { adminOnlineRoutes } from "./auth-routes/admin-online.ts";
import { adminPendingInventoryRoutes } from "./auth-routes/admin-pending-inventory.ts";
import { availabilityCountsRoutes } from "./auth-routes/availability-counts.ts";
import { adminCalendarLocksRoutes, calendarLocksRoutes } from "./auth-routes/calendar-locks.ts";
import { calendarRsvpsRoutes } from "./auth-routes/calendar-rsvps.ts";
import { userAvailabilityRoutes } from "./auth-routes/user-availability.ts";
import { userInventoryRoutes } from "./auth-routes/user-inventory.ts";
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

function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

const webOrigins = (process.env.WEB_ORIGIN ?? "").split(",").map(normalizeOrigin).filter(Boolean);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3001",
  "http://127.0.0.1:5173",
  ...webOrigins,
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
app.route("/api/admin/users", adminInventoryRoutes);
app.route("/api/admin/users", adminAvailabilityRoutes);
app.route("/api/admin", adminAvailabilityAllRoutes);
app.route("/api/admin", adminPendingInventoryRoutes);
app.route("/api/user", userAvailabilityRoutes);
app.route("/api/user", userInventoryRoutes);
app.route("/api/availability", availabilityCountsRoutes);
app.route("/api/calendar", calendarLocksRoutes);
app.route("/api/calendar", calendarRsvpsRoutes);
app.route("/api/admin/calendar", adminCalendarLocksRoutes);
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
