// App-wide greeting queue — the ONE popup a member may have pending.
//
// Generalizes the old `/api/skills/greeting` pair: the server arbitrates
// priority across every greeting kind so the client never has to. Ladder:
//
//   1. purchase-vote announce — one-time "voting is live" card (the same
//      launch treatment the skill intro got). Ack flips it off forever.
//   2. purchase-vote reminder — every later visit while the viewer still has
//      votes to spend (admins exempt — they run the vote). Its ack is
//      log-only, so it returns next app open.
//   3. purchase-vote result — one-time winner reveal after a poll closes.
//   4. The skill queue (intro, then spotlights) exactly as before.
//
// The greetings are CARDS about the vote; the voting screen is a separate
// modal they open — submitting votes can't unmount the card the player came
// from.
//
// Mounted behind plain requireAuth, but every kind is gated here on the
// viewer being offline-visible: `/api/purchase-vote` and `/api/skills` both
// sit behind requireOffline, so serving a greeting to an online-only account
// would dead-end its CTA on a 403. Fails closed like `requireOffline`.

import {
  AppGreetingAckBodySchema,
  AppGreetingAckResponseSchema,
  AppGreetingResponseSchema,
  OnlineModeSchema,
  VOTES_PER_PLAYER,
} from "@boardgames/core/protocol";
import { z } from "zod";
import { authedApp } from "../auth/index.ts";
import { logActivity } from "../lib/activity-log.ts";
import { zJsonBody } from "../lib/error-response.ts";
import { ackSkillIntro, ackSpotlight, nextGreetingFor } from "../lib/greetings.ts";
import {
  computeTally,
  distinctVoterCount,
  latestPoll,
  markPollSeen,
  pollSeen,
  pollVotes,
} from "../lib/purchase-vote.ts";
import { ensureSkillState } from "../lib/skill-ratings.ts";
import { greetingUserIds } from "../lib/spotlight-payload.ts";
import { playerRefs } from "../lib/user-refs.ts";

export const greetingsRoutes = authedApp();

const ViewerGateSchema = z.object({
  onlineMode: OnlineModeSchema,
  role: z.string().optional(),
});

// ── GET /api/greetings ─────────────────────────────────────────────────

greetingsRoutes.get("/", async (c) => {
  const viewer = c.get("user");
  const gate = ViewerGateSchema.safeParse(viewer);
  if (!gate.success || gate.data.onlineMode === "online") {
    return c.json(AppGreetingResponseSchema.parse({ greeting: null, players: {} }));
  }
  const isAdmin = gate.data.role === "admin";

  const poll = await latestPoll();
  if (poll) {
    const [votes, seen] = await Promise.all([pollVotes(poll.id), pollSeen(poll.id, viewer.id)]);
    const myVotes = votes.filter((v) => v.user_id === viewer.id).length;
    const votesLeft = Math.max(0, VOTES_PER_PLAYER - myVotes);
    if (poll.closed_at === null && seen.first_seen_at === null) {
      return c.json(
        AppGreetingResponseSchema.parse({
          greeting: {
            kind: "purchase-vote-announce",
            pollId: poll.id,
            candidates: poll.candidate_slugs_json,
            voterCount: distinctVoterCount(votes),
            requiredVoters: poll.required_voters,
          },
          players: {},
        }),
      );
    }
    // Admins run the vote — never nag the person who opened it. (The announce
    // and result cards still serve; only the recurring reminder is skipped.)
    if (poll.closed_at === null && votesLeft > 0 && !isAdmin) {
      return c.json(
        AppGreetingResponseSchema.parse({
          greeting: {
            kind: "purchase-vote-reminder",
            pollId: poll.id,
            votesLeft,
            voterCount: distinctVoterCount(votes),
            requiredVoters: poll.required_voters,
          },
          players: {},
        }),
      );
    }
    if (poll.closed_at !== null && poll.winner_slug !== null && seen.result_seen_at === null) {
      return c.json(
        AppGreetingResponseSchema.parse({
          greeting: {
            kind: "purchase-vote-result",
            pollId: poll.id,
            winnerSlug: poll.winner_slug,
            tally: computeTally(poll.candidate_slugs_json, votes),
          },
          players: {},
        }),
      );
    }
  }

  const greeting = await nextGreetingFor(viewer.id, (await ensureSkillState())?.state ?? null);
  return c.json(
    AppGreetingResponseSchema.parse({
      greeting,
      players: await playerRefs(greetingUserIds(greeting)),
    }),
  );
});

// ── POST /api/greetings/ack ────────────────────────────────────────────
//
// Every arm is idempotent; the vote arms are first-write-wins timestamps so
// the announce card and the reveal each show exactly once. The reminder ack
// writes NO seen-state on purpose — it comes back every visit until the
// votes are spent. Every ack also lands in the activity trail with the
// viewer's response ("later" = clicked away, "cta" = followed the button).

greetingsRoutes.post("/ack", zJsonBody(AppGreetingAckBodySchema), async (c) => {
  const viewer = c.get("user");
  const body = c.req.valid("json");
  switch (body.kind) {
    case "purchase-vote-announce":
      await markPollSeen(body.pollId, viewer.id, "first_seen_at");
      break;
    case "purchase-vote-reminder":
      break; // log-only
    case "purchase-vote-result":
      await markPollSeen(body.pollId, viewer.id, "result_seen_at");
      break;
    case "skill-intro":
      await ackSkillIntro(viewer.id);
      break;
    case "spotlight":
      await ackSpotlight(viewer.id, body.id);
      break;
  }
  logActivity(viewer.id, "greeting-response", {
    kind: body.kind,
    action: body.action,
    ...("pollId" in body ? { pollId: body.pollId } : {}),
    ...("id" in body ? { greetingId: body.id } : {}),
  });
  return c.json(AppGreetingAckResponseSchema.parse({ ok: true }));
});
