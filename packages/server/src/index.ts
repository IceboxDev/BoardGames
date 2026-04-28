import "dotenv/config";

import { serve } from "@hono/node-server";
import { initDb } from "./db.ts";
import { app, injectWebSocket } from "./server.ts";
import { markStaleRunning } from "./tournament/manager.ts";

import "./sessions/machine-registry.ts";

const PORT = Number(process.env.PORT ?? 3001);

await initDb();
await markStaleRunning();

const server = serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`@boardgames/server listening on http://localhost:${info.port}`);
});

injectWebSocket(server);
