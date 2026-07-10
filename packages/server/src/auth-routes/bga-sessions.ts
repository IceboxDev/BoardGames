// BGA bridge sessions — authenticated surface for our own users. The owner
// creates a session (receiving the ingest token for their userscript); any
// signed-in member with the join code can spectate the SSE stream. Modeled
// on the beamer session block in dnd-campaigns.ts.

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
  subscribeToBgaSession,
} from "../lib/bga-sessions.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";

export const bgaSessionRoutes = authedApp();

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
  // The uuid was handed out via the join code — possession authorizes.
  const session = getBgaSessionById(id);
  if (!session) return errorResponse(c, 404, "session not found", "NOT_FOUND");

  // EventSource reconnects resume via Last-Event-ID (the SSE id carries the
  // event seq); a fresh viewer can also pass ?since= explicitly.
  const lastEventId = c.req.header("Last-Event-ID");
  const sinceParam = lastEventId ?? c.req.query("since");
  const parsed = sinceParam === undefined ? Number.NaN : Number(sinceParam);
  const sinceSeq = Number.isInteger(parsed) ? parsed : -1;

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
    const send = (event: BgaEvent) => {
      void stream.writeSSE({
        data: JSON.stringify(BgaStreamEventSchema.parse({ type: "event", event })),
        id: String(event.seq),
      });
    };
    const unsubscribe = subscribeToBgaSession(id, send, sinceSeq);
    stream.onAbort(() => unsubscribe?.());
    // Hold the stream open until the client disconnects (onAbort cleans up).
    await new Promise(() => {});
  });
});
