// Admin skill-rating controls — recompute, then decide what (if anything) the
// group hears about it.
//
// The two steps are deliberately separate. Recompute is safe and repeatable;
// publishing puts a card in front of every member and is not. So a recompute
// only ever refits and rotates the baseline, and the candidate ranking it
// produces is re-derived from stored state on every read — there is no draft
// to go stale between the admin reading it and pressing Publish.

import {
  type AdminSkillStateResponse,
  AdminSkillStateResponseSchema,
  OkResponseSchema,
  PublishGreetingBodySchema,
} from "@boardgames/core/protocol";
import { adminApp } from "../auth/index.ts";
import { logActivity } from "../lib/activity-log.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";
import {
  type GreetingRow,
  latestGreeting,
  publishSpotlight,
  retractGreeting,
  seenCount,
} from "../lib/greetings.ts";
import { forceSkillRecompute, skillRatingStatus } from "../lib/skill-ratings.ts";
import { candidatesFor, greetingUserIds } from "../lib/spotlight-payload.ts";
import { playerRefs } from "../lib/user-refs.ts";

export const adminSkillsRoutes = adminApp();

async function liveGreeting(row: GreetingRow | null) {
  if (!row) return null;
  return {
    id: row.id,
    createdAt: row.created_at,
    subjectUserId: row.subject_user_id,
    payload: row.payload_json,
    seenBy: await seenCount(row.id),
  };
}

/** Everything the admin card renders, from the stored state alone. */
async function buildState(): Promise<AdminSkillStateResponse> {
  const [status, latest] = await Promise.all([skillRatingStatus(), latestGreeting()]);
  const candidates = candidatesFor(status);
  const live = await liveGreeting(latest);

  const ids = new Set(candidates.map((c) => c.subjectUserId));
  for (const id of greetingUserIds(live ? { kind: "spotlight", ...live } : null)) {
    ids.add(id);
  }

  return AdminSkillStateResponseSchema.parse({
    computedAt: status.computedAt,
    baselineComputedAt: status.baselineComputedAt,
    configVersion: status.configVersion,
    stale: status.stale,
    matchesTotal: status.matchesTotal,
    matchesChangedSince: status.matchesChangedSince,
    eligibleCount: status.state?.eligibleCount ?? 0,
    candidates,
    live,
    players: await playerRefs(ids),
  });
}

// ── GET /api/admin/skills ──────────────────────────────────────────────

adminSkillsRoutes.get("/", async (c) => c.json(await buildState()));

// ── POST /api/admin/skills/recompute ───────────────────────────────────
//
// Refits from scratch and rotates the baseline. Publishes nothing: the
// response carries the candidate ranking for the admin to read first.

adminSkillsRoutes.post("/recompute", async (c) => {
  const snapshot = await forceSkillRecompute();
  if (!snapshot) return errorResponse(c, 500, "recompute produced no state", "INTERNAL");
  const payload = await buildState();
  logActivity(c.get("user").id, "skill-recomputed", {
    matches: payload.matchesTotal,
    ranked: payload.eligibleCount,
    candidates: payload.candidates.length,
  });
  return c.json(payload);
});

// ── POST /api/admin/skills/greeting ────────────────────────────────────

adminSkillsRoutes.post("/greeting", zJsonBody(PublishGreetingBodySchema), async (c) => {
  const { candidateKey } = c.req.valid("json");
  const published = await publishSpotlight(candidateKey);
  // A 409, not a 404: the key was real, the ratings simply moved underneath it.
  if (!published) {
    return errorResponse(c, 409, "that move is no longer on offer — recompute first", "CONFLICT");
  }
  logActivity(c.get("user").id, "greeting-published", {
    greetingId: published.id,
    targetUserId: published.subject_user_id,
    eventKind: published.payload_json.event.kind,
  });
  return c.json(await buildState());
});

// ── POST /api/admin/skills/greeting/:id/retract ────────────────────────

adminSkillsRoutes.post("/greeting/:id{[0-9]+}/retract", async (c) => {
  const id = Number.parseInt(c.req.param("id"), 10);
  if (!(await retractGreeting(id))) return errorResponse(c, 404, "greeting not found");
  logActivity(c.get("user").id, "greeting-retracted", { greetingId: id });
  return c.json(OkResponseSchema.parse({ ok: true }));
});
