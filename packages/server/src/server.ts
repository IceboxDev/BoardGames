import { AuthConfigSchema, WsTicketResponseSchema } from "@boardgames/core/protocol";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth, requireAdmin, requireAuth, requireWsAuth } from "./auth/index.ts";
import {
  adminAvailabilityAllRoutes,
  adminAvailabilityRoutes,
} from "./auth-routes/admin-availability.ts";
import { adminInventoryRoutes } from "./auth-routes/admin-inventory.ts";
import { adminMatchHistoryRoutes } from "./auth-routes/admin-match-history.ts";
import { adminOnlineRoutes } from "./auth-routes/admin-online.ts";
import { adminPendingInventoryRoutes } from "./auth-routes/admin-pending-inventory.ts";
import { availabilityCountsRoutes } from "./auth-routes/availability-counts.ts";
import { bggRoutes } from "./auth-routes/bgg.ts";
import { calendarFeedRoutes } from "./auth-routes/calendar-feed.ts";
import { calendarFeedPublicRoutes } from "./auth-routes/calendar-feed-public.ts";
import { adminCalendarLocksRoutes, calendarLocksRoutes } from "./auth-routes/calendar-locks.ts";
import { calendarRsvpsRoutes } from "./auth-routes/calendar-rsvps.ts";
import { matchHistoryRoutes } from "./auth-routes/match-history.ts";
import { userAvailabilityRoutes } from "./auth-routes/user-availability.ts";
import { userInventoryRoutes } from "./auth-routes/user-inventory.ts";
import { persistenceRoutes } from "./persistence/routes.ts";
import { getRegisteredSlugs } from "./sessions/machine-registry.ts";
import { handleWsClose, handleWsMessage, wsAuth } from "./sessions/manager.ts";
import { ClientMessageParseError, parseClientMessage } from "./sessions/parse-client-message.ts";
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
import { signWsTicket } from "./sessions/ws-ticket.ts";
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
  c.json(AuthConfigSchema.parse({ googleEnabled: Boolean(process.env.GOOGLE_CLIENT_ID) })),
);

app.get("/api/health", (c) => c.json({ ok: true, games: getRegisteredSlugs() }));

// Public iCalendar feed. Path-token authentication (see auth/feed-token.ts),
// no session cookie required — calendar clients are external. Mounted on
// its own prefix so the `/api/calendar/*` requireAuth umbrella does NOT
// intercept it; the existing `/api/*` CORS rule applies but is harmless for
// the non-browser fetchers that hit this endpoint.
app.route("/api/ical", calendarFeedPublicRoutes);

// --- Protected: admin only ---
app.use("/api/admin/*", requireAdmin);
app.route("/api/admin/users", adminOnlineRoutes);
app.route("/api/admin/users", adminInventoryRoutes);
app.route("/api/admin/users", adminAvailabilityRoutes);
app.route("/api/admin", adminAvailabilityAllRoutes);
app.route("/api/admin", adminPendingInventoryRoutes);
app.route("/api/admin/calendar", adminCalendarLocksRoutes);
app.route("/api/admin/history", adminMatchHistoryRoutes);

// --- Protected: any logged-in user ---
app.use("/api/user/*", requireAuth);
app.route("/api/user", userAvailabilityRoutes);
app.route("/api/user", userInventoryRoutes);

app.use("/api/availability/*", requireAuth);
app.route("/api/availability", availabilityCountsRoutes);

app.use("/api/calendar/*", requireAuth);
app.route("/api/calendar", calendarLocksRoutes);
app.route("/api/calendar", calendarRsvpsRoutes);
app.route("/api/calendar", calendarFeedRoutes);

app.use("/api/history/*", requireAuth);
app.route("/api/history", matchHistoryRoutes);

app.use("/api/bgg/*", requireAuth);
app.route("/api/bgg", bggRoutes);

app.use("/api/tournaments/*", requireAuth);
app.route("/api/tournaments", tournamentRoutes);

app.use("/api/games/*", requireAuth);
app.route("/api/games", persistenceRoutes);

// Issues a short-lived ticket for the cross-origin WebSocket handshake. The
// cookie authenticates this HTTP call (same-origin via the web proxy); the
// returned ticket then authenticates the direct `/ws` connection. See
// sessions/ws-ticket.ts for why the cookie can't be used on `/ws` directly.
app.get("/api/ws-ticket", requireAuth, (c) =>
  c.json(WsTicketResponseSchema.parse({ ticket: signWsTicket(c.get("user").id) })),
);

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

app.use("/ws", requireWsAuth);
app.get(
  "/ws",
  upgradeWebSocket((c) => {
    const userId = c.get("wsUserId");
    return {
      onOpen(_event, ws) {
        wsAuth.set(ws, userId);
      },
      onMessage(event, ws) {
        const data = typeof event.data === "string" ? event.data : "";

        // Validate the envelope once. On shape mismatch, send a typed error
        // back rather than letting downstream handlers see the raw payload.
        let msg: ClientToServerMessage;
        try {
          msg = parseClientMessage(data);
        } catch (err) {
          const message =
            err instanceof ClientMessageParseError
              ? `Malformed message: ${JSON.stringify(err.issues)}`
              : "Malformed message";
          ws.send(JSON.stringify({ type: "error", message }));
          return;
        }

        if (handleRoomMessage(ws, msg)) return;
        handleWsMessage(ws, msg);
      },
      onClose(_event, ws) {
        wsAuth.delete(ws);
        handleWsClose(ws);
      },
    };
  }),
);

export { app, injectWebSocket };
