import { AuthConfigSchema, WsTicketResponseSchema } from "@boardgames/core/protocol";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  auth,
  requireAdmin,
  requireAuth,
  requireOffline,
  requireOnline,
  requireWsAuth,
} from "./auth/index.ts";
import {
  adminAvailabilityAllRoutes,
  adminAvailabilityRoutes,
} from "./auth-routes/admin-availability.ts";
import { adminInventoryRoutes } from "./auth-routes/admin-inventory.ts";
import { adminMatchHistoryRoutes } from "./auth-routes/admin-match-history.ts";
import { adminOnlineRoutes } from "./auth-routes/admin-online.ts";
import { adminPasswordResetRoutes } from "./auth-routes/admin-password-reset.ts";
import { adminPendingInventoryRoutes } from "./auth-routes/admin-pending-inventory.ts";
import { availabilityCountsRoutes } from "./auth-routes/availability-counts.ts";
import { avatarRoutes } from "./auth-routes/avatar.ts";
import { bgaIngestRoutes } from "./auth-routes/bga-ingest.ts";
import { bgaSessionRoutes } from "./auth-routes/bga-sessions.ts";
import { bggRoutes } from "./auth-routes/bgg.ts";
import { calendarFeedRoutes } from "./auth-routes/calendar-feed.ts";
import { calendarFeedPublicRoutes } from "./auth-routes/calendar-feed-public.ts";
import { adminCalendarLocksRoutes, calendarLocksRoutes } from "./auth-routes/calendar-locks.ts";
import { calendarRsvpsRoutes } from "./auth-routes/calendar-rsvps.ts";
import { dndCampaignRoutes } from "./auth-routes/dnd-campaigns.ts";
import { matchHistoryRoutes } from "./auth-routes/match-history.ts";
import { profileRoutes } from "./auth-routes/profile.ts";
import { userAvailabilityRoutes } from "./auth-routes/user-availability.ts";
import { userInventoryRoutes } from "./auth-routes/user-inventory.ts";
import { probeOpenAI } from "./lib/dnd-extract.ts";
import { persistenceRoutes } from "./persistence/routes.ts";
import { getRegisteredSlugs } from "./sessions/machine-registry.ts";
import { handleWsClose, handleWsMessage, wsAuth } from "./sessions/manager.ts";
import { ClientMessageParseError, parseClientMessage } from "./sessions/parse-client-message.ts";
import {
  handleChat,
  handleConfigureRoom,
  handleCreateRoom,
  handleJoinRoom,
  handleKickPlayer,
  handleLeaveRoom,
  handleStartRoom,
  handleSwapSeats,
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

// OpenAI reachability from THIS host (`?gen=1` exercises the referee's
// exact background+poll transport with a one-word generation).
app.get("/api/health/openai", async (c) => {
  const result = await probeOpenAI(c.req.query("gen") === "1");
  return c.json(result, result.ok ? 200 : 502);
});

// `commit` verifies WHICH build is live (Railway injects the SHA) — deploy
// races have burned us before ("the fix doesn't work" while it was rolling).
app.get("/api/health", (c) =>
  c.json({
    ok: true,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    games: getRegisteredSlugs(),
  }),
);

// Public iCalendar feed. Path-token authentication (see auth/feed-token.ts),
// no session cookie required — calendar clients are external. Mounted on
// its own prefix so the `/api/calendar/*` requireAuth umbrella does NOT
// intercept it; the existing `/api/*` CORS rule applies but is harmless for
// the non-browser fetchers that hit this endpoint.
app.route("/api/ical", calendarFeedPublicRoutes);

// Public BGA-bridge ingest: the producer is a userscript on boardgamearena.com
// (GM_xmlhttpRequest — no cookie), authenticated by its per-session ingest
// token instead of the requireAuth umbrella. See auth-routes/bga-ingest.ts.
app.route("/api/bga-ingest", bgaIngestRoutes);

// --- Protected: admin only ---
app.use("/api/admin/*", requireAdmin);
app.route("/api/admin/users", adminOnlineRoutes);
app.route("/api/admin/users", adminInventoryRoutes);
app.route("/api/admin/users", adminAvailabilityRoutes);
app.route("/api/admin/users", adminPasswordResetRoutes);
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

// Profiles are an offline-players feature: online-only users are blocked.
app.use("/api/profiles/*", requireAuth, requireOffline);
app.route("/api/profiles", profileRoutes);
app.route("/api/profiles", avatarRoutes);

app.use("/api/bgg/*", requireAuth);
app.route("/api/bgg", bggRoutes);

// Tournaments fork one CPU worker per core, so they're gated to online-mode
// users (not just any logged-in account); the route handler additionally caps
// each user to one running tournament at a time (see tournament/manager.ts).
app.use("/api/tournaments/*", requireAuth, requireOnline);
app.route("/api/tournaments", tournamentRoutes);

// D&D DM tool (campaign hall). Lives in the play area, so gated like it.
app.use("/api/dnd/*", requireAuth, requireOnline);
app.route("/api/dnd", dndCampaignRoutes);

// BGA bridge sessions (create / join-by-code / SSE spectate). Play-area
// feature, gated like the games it mirrors.
app.use("/api/bga/*", requireAuth, requireOnline);
app.route("/api/bga", bgaSessionRoutes);

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
    case "swap-seats":
      handleSwapSeats(ws, msg);
      return true;
    case "chat":
      handleChat(ws, msg);
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

        // Liveness probe — answer immediately and don't route it further.
        if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
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
