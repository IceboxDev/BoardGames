/**
 * The `katago` Railway service: KataGo's analysis engine behind a tiny
 * authenticated HTTP API, so its CPU-heavy search runs on its own box instead
 * of starving the game server's event loop. The game server reaches it with
 * KATAGO_URL + KATAGO_BRIDGE_SECRET (`http-engine.ts`).
 *
 *   POST /v1/query  { query, timeoutMs } → { responses }   (Bearer secret)
 *   GET  /health    → { ready, detail }
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { z } from "zod";
import { localKataGo } from "./engine.ts";
import { KataGoQuerySchema } from "./protocol.ts";

const secret = process.env.KATAGO_BRIDGE_SECRET;
if (!secret) throw new Error("KATAGO_BRIDGE_SECRET is required");
const engine = localKataGo();
if (!engine) throw new Error("KATAGO_BIN and KATAGO_MODEL are required");

const QueryBodySchema = z.object({
  query: KataGoQuerySchema.omit({ id: true }),
  timeoutMs: z
    .number()
    .int()
    .min(100)
    .max(10 * 60_000),
});

const app = new Hono();

app.get("/health", (c) => c.json(engine.status()));

app.post("/v1/query", async (c) => {
  if (c.req.header("authorization") !== `Bearer ${secret}`)
    return c.json({ error: "unauthorized" }, 401);
  const body = QueryBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!body.success) return c.json({ error: "bad request" }, 400);
  try {
    // Ids are the engine's own, so callers can't collide with each other.
    const responses = await engine.query(body.data.query, body.data.timeoutMs);
    return c.json({ responses });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 502);
  }
});

const port = Number(process.env.PORT ?? 8080);
serve({ fetch: app.fetch, port });
console.log(`[katago-bridge] listening on ${port}`);
