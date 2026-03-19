import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { persistenceRoutes } from "./persistence/routes.ts";
import { getRegisteredSlugs } from "./sessions/machine-registry.ts";
import { handleWsClose, handleWsMessage } from "./sessions/manager.ts";
import { tournamentRoutes } from "./tournament/routes.ts";

const app = new Hono();

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ ok: true, games: getRegisteredSlugs() }));

app.route("/api/tournaments", tournamentRoutes);
app.route("/api/games", persistenceRoutes);

app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onMessage(event, ws) {
      const data = typeof event.data === "string" ? event.data : "";
      handleWsMessage(ws, data);
    },
    onClose(_event, ws) {
      handleWsClose(ws);
    },
  })),
);

export { app, injectWebSocket };
