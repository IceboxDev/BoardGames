// Admin inspection of the AI ledger (see `lib/ai/ledger.ts`): what the AI
// spent since the server started, and the recent calls in full — prompt,
// answer, tokens, billed cost — so a production game's surprising move can be
// read back. In memory only; a deploy clears it. Codenames notes carry the
// ids of the calls behind each clue and guess.
//
//   GET /api/admin/ai-calls?feature=codenames&limit=50
//   GET /api/admin/ai-calls/:id

import {
  AiCallDetailSchema,
  AiCallsQuerySchema,
  AiCallsResponseSchema,
} from "@boardgames/core/protocol";
import { adminApp } from "../auth/index.ts";
import { aiSpendTotals, findAiCall, recentAiCalls } from "../lib/ai/index.ts";
import { errorResponse, zQuery } from "../lib/error-response.ts";

export const adminAiCallRoutes = adminApp();

adminAiCallRoutes.get("/ai-calls", zQuery(AiCallsQuerySchema), (c) => {
  const { feature, limit } = c.req.valid("query");
  const calls = [...recentAiCalls()]
    .reverse()
    .filter((r) => feature === undefined || r.feature === feature)
    .slice(0, limit)
    .map(({ system: _s, user: _u, output: _o, transport: _t, ...summary }) => summary);
  return c.json(AiCallsResponseSchema.parse({ totals: aiSpendTotals(), calls }));
});

adminAiCallRoutes.get("/ai-calls/:id", (c) => {
  const call = findAiCall(c.req.param("id"));
  if (!call) return errorResponse(c, 404, "No such AI call in memory", "NOT_FOUND");
  return c.json(AiCallDetailSchema.parse(call));
});
