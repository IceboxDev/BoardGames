/**
 * /api/go — KataGo reviews of Go games.
 *
 *   GET  /reviews/by-replay/:id  a finished match's review (any member, like the replay itself);
 *                                queues one for an older match that has none
 *   POST /reviews                import an SGF for review (rate-limited per member)
 *   GET  /reviews                the member's imported reviews
 *   GET  /reviews/:id            one imported review (its owner only)
 */
import {
  CreateGoReviewRequestSchema,
  CreateGoReviewResponseSchema,
  GoReviewListSchema,
  GoReviewSchema,
} from "@boardgames/core/protocol";
import { authedApp } from "../auth/index.ts";
import { kataGoEngine } from "../katago/engine.ts";
import { logActivity } from "../lib/activity-log.ts";
import { errorResponse, zJsonBody } from "../lib/error-response.ts";
import { getMatchLog } from "../matches/store.ts";
import {
  createSgfReview,
  enqueueReplayReview,
  listOwnReviews,
  reviewByReplay,
  reviewForOwner,
  unavailableReview,
} from "./go-reviews.ts";

export const goReviewRoutes = authedApp();

goReviewRoutes.get("/reviews/by-replay/:id{[0-9]+}", async (c) => {
  const replayId = Number(c.req.param("id"));
  const existing = await reviewByReplay(replayId);
  if (existing) return c.json(GoReviewSchema.parse(existing));
  if (!kataGoEngine()) return c.json(GoReviewSchema.parse(unavailableReview()));
  if ((await getMatchLog("go", replayId)) === null) return errorResponse(c, 404, "Not found");
  await enqueueReplayReview(replayId);
  const queued = await reviewByReplay(replayId);
  return c.json(GoReviewSchema.parse(queued ?? unavailableReview()));
});

goReviewRoutes.post("/reviews", zJsonBody(CreateGoReviewRequestSchema), async (c) => {
  if (!kataGoEngine()) return errorResponse(c, 503, "Game review is not available right now");
  const user = c.get("user");
  const created = await createSgfReview(user.id, c.req.valid("json").sgf);
  if (!created.ok) return errorResponse(c, created.status, created.message);
  logActivity(user.id, "go-review-requested", { reviewId: created.id, moves: created.moves });
  return c.json(CreateGoReviewResponseSchema.parse({ id: created.id }), 201);
});

goReviewRoutes.get("/reviews", async (c) => {
  return c.json(GoReviewListSchema.parse(await listOwnReviews(c.get("user").id)));
});

goReviewRoutes.get("/reviews/:id{[0-9]+}", async (c) => {
  const review = await reviewForOwner(Number(c.req.param("id")), c.get("user").id);
  if (!review) return errorResponse(c, 404, "Not found");
  return c.json(GoReviewSchema.parse(review));
});
