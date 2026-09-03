// Player-facing purchase-vote endpoints — the poll state and the vote submit.
//
// The per-game tally is deliberately withheld while the poll is open (only
// participation progress is public — the same anti-bandwagon stance as the
// carousel hiding reaction counts); it appears in `results` once closed.
// Voting is a single-submit REPLACE of the viewer's whole vote set (the
// voting screen collects picks locally and saves once), plus the one rule
// the schema can't express: auto-close the instant the required number of
// distinct voters is reached.

import {
  PurchaseVoteStateSchema,
  PurchaseVoteWriteResponseSchema,
  SetPurchaseVotesBodySchema,
  VOTES_PER_PLAYER,
} from "@boardgames/core/protocol";
import { authedApp } from "../auth/index.ts";
import { getDb } from "../db.ts";
import { logActivity } from "../lib/activity-log.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";
import {
  closePoll,
  computeTally,
  distinctVoterCount,
  latestPoll,
  pollVotes,
} from "../lib/purchase-vote.ts";

export const purchaseVoteRoutes = authedApp();

// ── GET /api/purchase-vote ─────────────────────────────────────────────

purchaseVoteRoutes.get("/", async (c) => {
  const viewer = c.get("user");
  const poll = await latestPoll();
  if (!poll) return c.json(PurchaseVoteStateSchema.parse({ poll: null }));

  const votes = await pollVotes(poll.id);
  const myVotes = votes.filter((v) => v.user_id === viewer.id).map((v) => v.slug);
  const closed = poll.closed_at !== null;
  return c.json(
    PurchaseVoteStateSchema.parse({
      poll: {
        id: poll.id,
        candidates: poll.candidate_slugs_json,
        requiredVoters: poll.required_voters,
        voterCount: distinctVoterCount(votes),
        myVotes,
        votesLeft: Math.max(0, VOTES_PER_PLAYER - myVotes.length),
        closedAt: poll.closed_at,
        winnerSlug: poll.winner_slug,
        results: closed ? { tally: computeTally(poll.candidate_slugs_json, votes) } : null,
      },
    }),
  );
});

// ── PUT /api/purchase-vote/votes ───────────────────────────────────────
//
// Replace the viewer's whole vote set. Delete-then-insert rather than a
// diff: at ≤3 rows the simplicity wins, and the composite PK makes the
// inserts safe regardless.

purchaseVoteRoutes.put("/votes", zJsonBody(SetPurchaseVotesBodySchema), async (c) => {
  const viewer = c.get("user");
  const { slugs } = c.req.valid("json");

  const poll = await latestPoll();
  if (!poll) return errorResponse(c, 404, "no purchase vote is open", "NOT_FOUND");
  if (poll.closed_at !== null) {
    return errorResponse(c, 409, "the vote has closed", "POLL_CLOSED");
  }
  const invalid = slugs.find((slug) => !poll.candidate_slugs_json.includes(slug));
  if (invalid !== undefined) {
    return errorResponse(c, 400, `"${invalid}" is not a candidate in this vote`);
  }

  const db = getDb();
  await db.execute({
    sql: "DELETE FROM purchase_poll_votes WHERE poll_id = ? AND user_id = ?",
    args: [poll.id, viewer.id],
  });
  for (const slug of slugs) {
    await db.execute({
      sql: "INSERT OR IGNORE INTO purchase_poll_votes (poll_id, user_id, slug) VALUES (?, ?, ?)",
      args: [poll.id, viewer.id, slug],
    });
  }

  // Auto-close: re-read after the write so the submit that makes quorum is
  // the one that seals the poll. `closePoll` is idempotent under a race.
  if (slugs.length > 0) {
    const after = await pollVotes(poll.id);
    if (distinctVoterCount(after) >= poll.required_voters) await closePoll(poll);
  }

  logActivity(viewer.id, "purchase-vote", { pollId: poll.id, slugs });
  return c.json(PurchaseVoteWriteResponseSchema.parse({ ok: true }));
});
