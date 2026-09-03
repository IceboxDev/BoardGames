// Admin purchase-vote endpoints — configure, monitor, and resolve the poll.
//
// Unlike the player route, the admin payload always carries the live tally
// and the voter list. Exactly one poll may be open at a time; a new one can
// only be created once the previous is closed. Deleting is limited to an
// OPEN poll (mistake recovery) — closed polls are history and feed the
// winner-reveal greeting.

import {
  AdminCreatePollBodySchema,
  AdminPurchaseVoteStateSchema,
  AdminPurchaseVoteWriteResponseSchema,
} from "@boardgames/core/protocol";
import { adminApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { logActivity } from "../lib/activity-log.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";
import { closePoll, computeTally, latestPoll, pollVotes } from "../lib/purchase-vote.ts";
import { playerRefs } from "../lib/user-refs.ts";

export const adminPurchaseVoteRoutes = adminApp();

// ── GET /api/admin/purchase-vote ───────────────────────────────────────

adminPurchaseVoteRoutes.get("/", async (c) => {
  const poll = await latestPoll();
  if (!poll) return c.json(AdminPurchaseVoteStateSchema.parse({ poll: null }));

  const votes = await pollVotes(poll.id);
  const voterIds = new Set(votes.map((v) => v.user_id));
  const refs = await playerRefs(voterIds);
  return c.json(
    AdminPurchaseVoteStateSchema.parse({
      poll: {
        id: poll.id,
        createdAt: poll.created_at,
        candidates: poll.candidate_slugs_json,
        requiredVoters: poll.required_voters,
        voterCount: voterIds.size,
        closedAt: poll.closed_at,
        winnerSlug: poll.winner_slug,
        tally: computeTally(poll.candidate_slugs_json, votes),
        voters: [...voterIds].map((id) => ({ id, name: refs[id]?.name ?? "?" })),
      },
    }),
  );
});

// ── POST /api/admin/purchase-vote ──────────────────────────────────────

adminPurchaseVoteRoutes.post("/", zJsonBody(AdminCreatePollBodySchema), async (c) => {
  const admin = c.get("user");
  const { candidates, requiredVoters } = c.req.valid("json");

  const current = await latestPoll();
  if (current && current.closed_at === null) {
    return errorResponse(c, 409, "a purchase vote is already open", "POLL_ALREADY_OPEN");
  }

  await getDb().execute({
    sql: "INSERT INTO purchase_polls (candidate_slugs_json, required_voters) VALUES (?, ?)",
    args: [JSON.stringify(candidates), requiredVoters],
  });
  logActivity(admin.id, "purchase-vote-admin", { action: "create", candidates, requiredVoters });
  return c.json(AdminPurchaseVoteWriteResponseSchema.parse({ ok: true }));
});

// ── POST /api/admin/purchase-vote/close ────────────────────────────────

adminPurchaseVoteRoutes.post("/close", async (c) => {
  const admin = c.get("user");
  const poll = await latestPoll();
  if (!poll || poll.closed_at !== null) {
    return errorResponse(c, 409, "no open purchase vote to close", "POLL_CLOSED");
  }
  await closePoll(poll);
  logActivity(admin.id, "purchase-vote-admin", { action: "close", pollId: poll.id });
  return c.json(AdminPurchaseVoteWriteResponseSchema.parse({ ok: true }));
});

// ── DELETE /api/admin/purchase-vote ────────────────────────────────────

adminPurchaseVoteRoutes.delete("/", async (c) => {
  const admin = c.get("user");
  const poll = await latestPoll();
  if (!poll || poll.closed_at !== null) {
    return errorResponse(c, 409, "no open purchase vote to delete", "POLL_CLOSED");
  }
  await getDb().execute({ sql: "DELETE FROM purchase_polls WHERE id = ?", args: [poll.id] });
  logActivity(admin.id, "purchase-vote-admin", { action: "delete", pollId: poll.id });
  return c.json(AdminPurchaseVoteWriteResponseSchema.parse({ ok: true }));
});
