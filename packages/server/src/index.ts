// MUST be the very first import — populates process.env before anything else
// (including auth.ts) evaluates. See env.ts for the full reasoning.
import "./env.ts";

import { serve } from "@hono/node-server";
import { initDb } from "./db.ts";
import { app, injectWebSocket } from "./server.ts";
import { markStaleRunning } from "./tournament/manager.ts";

import "./sessions/machine-registry.ts";

const PORT = Number(process.env.PORT ?? 3001);

await initDb();
await markStaleRunning();

// Production (Railway) requires IPv6 wildcard `::` so the IPv6-first internal
// network can reach the container. In dev, Vite's proxy connects to
// 127.0.0.1, so bind to the IPv4 wildcard to accept that. (Linux *should*
// dual-stack `::` for IPv4 too, but some systems/Node configs end up
// IPv6-only — be explicit instead of relying on it.)
const HOSTNAME = process.env.NODE_ENV === "production" ? "::" : "0.0.0.0";
const server = serve({ fetch: app.fetch, port: PORT, hostname: HOSTNAME }, (info) => {
  console.log(
    `@boardgames/server listening on port ${info.port} (${info.address}, ${info.family})`,
  );
});

injectWebSocket(server);
