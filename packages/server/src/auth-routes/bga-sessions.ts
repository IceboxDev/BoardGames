// BGA bridge sessions — authenticated surface for our own users. The owner
// creates a session (receiving the ingest token for their userscript); any
// signed-in member with the join code can spectate the SSE stream. Modeled
// on the beamer session block in dnd-campaigns.ts.

import { appendFileSync } from "node:fs";
import {
  ActiveBgaSessionResponseSchema,
  type BgaEvent,
  BgaSessionByCodeResponseSchema,
  BgaStreamEventSchema,
  CreateBgaSessionRequestSchema,
  CreateBgaSessionResponseSchema,
} from "@boardgames/core/protocol";
import { streamSSE } from "hono/streaming";
import { authedApp } from "../auth/index.ts";
import {
  createOrReuseBgaSession,
  getActiveBgaSession,
  getBgaSessionByCode,
  getBgaSessionById,
  getBgaSessionLastSeq,
  reviveBgaSessionForOwner,
  subscribeToBgaSession,
} from "../lib/bga-sessions.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";

export const bgaSessionRoutes = authedApp();

// Dev-only trace of SSE spectate connections, to diagnose a blank viewer.
const SSE_LOG = process.env.NODE_ENV !== "production" ? "bga-sse.log" : null;
function sseLog(msg: string): void {
  if (!SSE_LOG) return;
  try {
    appendFileSync(SSE_LOG, `${new Date().toISOString()} ${msg}\n`);
  } catch {}
}

// Dev-only: log every /api/bga/* request the browser makes, with its status.
if (SSE_LOG) {
  bgaSessionRoutes.use("*", async (c, next) => {
    await next();
    sseLog(`REQ ${c.req.method} ${c.req.path} -> ${c.res.status}`);
  });
}

bgaSessionRoutes.post("/sessions", zJsonBody(CreateBgaSessionRequestSchema), (c) => {
  const user = c.get("user");
  const { game } = c.req.valid("json");
  const { session, ingestToken } = createOrReuseBgaSession(user.id, game);
  return c.json(CreateBgaSessionResponseSchema.parse({ session, ingestToken }));
});

bgaSessionRoutes.get("/sessions/active", (c) => {
  const session = getActiveBgaSession(c.get("user").id);
  return c.json(ActiveBgaSessionResponseSchema.parse({ session }));
});

// Spectator join: the code typed on another device resolves the session.
bgaSessionRoutes.get("/sessions/by-code/:code", (c) => {
  const session = getBgaSessionByCode(c.req.param("code"));
  return c.json(BgaSessionByCodeResponseSchema.parse({ session }));
});

bgaSessionRoutes.get("/sessions/:id/stream", (c) => {
  const id = c.req.param("id");
  // The uuid was handed out via the join code — possession authorizes. If the
  // session was wiped by a restart, revive it for its owner so reconnects work.
  const session = getBgaSessionById(id) ?? reviveBgaSessionForOwner(c.get("user").id, id);
  if (!session) {
    sseLog(`connect id=${id.slice(0, 8)} -> 404 (session not live)`);
    return errorResponse(c, 404, "session not found", "NOT_FOUND");
  }

  // EventSource reconnects resume via Last-Event-ID (the SSE id carries the
  // event seq); a fresh viewer can also pass ?since= explicitly.
  const lastEventId = c.req.header("Last-Event-ID");
  const sinceParam = lastEventId ?? c.req.query("since");
  const parsed = sinceParam === undefined ? Number.NaN : Number(sinceParam);
  const sinceSeq = Number.isInteger(parsed) ? parsed : -1;

  sseLog(`connect id=${id.slice(0, 8)} since=${sinceSeq} lastSeq=${getBgaSessionLastSeq(id)}`);
  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      data: JSON.stringify(
        BgaStreamEventSchema.parse({
          type: "connected",
          session,
          lastSeq: getBgaSessionLastSeq(id),
        }),
      ),
    });
    let sent = 0;
    const send = (event: BgaEvent) => {
      sent++;
      void stream.writeSSE({
        data: JSON.stringify(BgaStreamEventSchema.parse({ type: "event", event })),
        id: String(event.seq),
      });
    };
    const unsubscribe = subscribeToBgaSession(id, send, sinceSeq);
    sseLog(`  id=${id.slice(0, 8)} replayed ${sent} buffered events`);
    stream.onAbort(() => {
      sseLog(`  id=${id.slice(0, 8)} disconnected after ${sent} events`);
      unsubscribe?.();
    });
    // Hold the stream open until the client disconnects (onAbort cleans up).
    await new Promise(() => {});
  });
});
