// Public BGA-bridge ingest endpoint. The producer is a userscript running on
// boardgamearena.com (GM_xmlhttpRequest — no cookie, no CORS), so this route
// sits OUTSIDE the requireAuth umbrella (precedent: /api/ical) and is gated
// by the opaque ingest token minted with the bridge session instead.

import {
  BGA_EVENT_PAYLOAD_MAX,
  IngestBgaEventsRequestSchema,
  IngestBgaEventsResponseSchema,
} from "@boardgames/core/protocol";
import { bodyLimit } from "hono/body-limit";
import { publicApp } from "../auth/index.ts";
import { ingestBgaEvents } from "../lib/bga-sessions.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";

export const bgaIngestRoutes = publicApp();

bgaIngestRoutes.post(
  "/",
  bodyLimit({
    maxSize: 2 * 1024 * 1024,
    onError: (c) => errorResponse(c, 413, "Body too large", "PAYLOAD_TOO_LARGE"),
  }),
  zJsonBody(IngestBgaEventsRequestSchema),
  (c) => {
    const { token, events } = c.req.valid("json");

    for (const event of events) {
      if (JSON.stringify(event.payload).length > BGA_EVENT_PAYLOAD_MAX) {
        return errorResponse(c, 413, "Event payload too large", "PAYLOAD_TOO_LARGE");
      }
    }

    const result = ingestBgaEvents(token, events);
    if (!result.ok) {
      const code =
        result.status === 401
          ? "UNAUTHORIZED"
          : result.status === 429
            ? "RATE_LIMITED"
            : "PAYLOAD_TOO_LARGE";
      return errorResponse(c, result.status, result.error, code);
    }

    return c.json(
      IngestBgaEventsResponseSchema.parse({
        ok: true,
        accepted: result.accepted,
        nextSeq: result.nextSeq,
      }),
    );
  },
);
