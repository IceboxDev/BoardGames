import dotenv from "dotenv";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ quiet: true });

import { serve } from "@hono/node-server";
import { initDb } from "./db.ts";
import { app, injectWebSocket } from "./server.ts";
import { markStaleRunning } from "./tournament/manager.ts";

import "./sessions/machine-registry.ts";

const PORT = Number(process.env.PORT ?? 3001);

await initDb();
await markStaleRunning();

// Bind to IPv6 wildcard so Railway's IPv6-first internal network can reach
// the container; Linux dual-stack also accepts IPv4 connections on this socket.
const server = serve({ fetch: app.fetch, port: PORT, hostname: "::" }, (info) => {
  console.log(
    `@boardgames/server listening on port ${info.port} (${info.address}, ${info.family})`,
  );
});

injectWebSocket(server);
