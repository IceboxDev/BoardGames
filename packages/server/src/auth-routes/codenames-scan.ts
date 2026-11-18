// Codenames Companion — `POST /api/games/codenames/scan`: a photo of the
// table's grid in, the 25 words out (`lib/codenames-scan.ts`). Metered in
// `server.ts`: each scan is a paid vision call.

import { CodenamesScanRequestSchema, CodenamesScanResponseSchema } from "@boardgames/core/protocol";
import { authedApp } from "../auth/index.ts";
import { AiConfigError, aiAvailable } from "../lib/ai";
import { ScanProblem, scanGrid } from "../lib/codenames-scan.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";

export const codenamesScanRoutes = authedApp();

codenamesScanRoutes.post("/", zJsonBody(CodenamesScanRequestSchema), async (c) => {
  if (!aiAvailable()) {
    return errorResponse(c, 503, "Reading photos isn't available right now", "AI_UNAVAILABLE");
  }
  try {
    const grid = await scanGrid(c.req.valid("json").image);
    return c.json(CodenamesScanResponseSchema.parse(grid));
  } catch (err) {
    if (err instanceof ScanProblem) return errorResponse(c, 422, err.message, "UNREADABLE");
    if (err instanceof AiConfigError) return errorResponse(c, 503, err.message, "AI_UNAVAILABLE");
    console.error("[codenames-scan] failed:", err);
    return errorResponse(c, 502, "The photo couldn't be read — try again", "SCAN_FAILED");
  }
});
