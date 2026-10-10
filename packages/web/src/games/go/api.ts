import {
  CreateGoReviewRequestSchema,
  CreateGoReviewResponseSchema,
  type GoReview,
  GoReviewListSchema,
  GoReviewSchema,
} from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "../../lib/query-keys";
import { jsonMutation, jsonQuery } from "../../lib/typed-query";

/** Poll while KataGo is still working on it. */
function pollWhilePending(review: GoReview | undefined): number | false {
  return review && (review.status === "queued" || review.status === "running") ? 4000 : false;
}

export function useReplayReview(replayId: number | null) {
  return useQuery<GoReview>({
    queryKey: qk.goReviewByReplay(replayId ?? 0),
    queryFn: jsonQuery(`/api/go/reviews/by-replay/${replayId}`, GoReviewSchema),
    enabled: replayId !== null,
    refetchInterval: (q) => pollWhilePending(q.state.data),
  });
}

export function useOwnReview(id: number | null) {
  return useQuery<GoReview>({
    queryKey: qk.goReview(id ?? 0),
    queryFn: jsonQuery(`/api/go/reviews/${id}`, GoReviewSchema),
    enabled: id !== null,
    refetchInterval: (q) => pollWhilePending(q.state.data),
  });
}

export function useOwnReviews() {
  return useQuery({
    queryKey: qk.goReviews(),
    queryFn: jsonQuery("/api/go/reviews", GoReviewListSchema),
  });
}

const createReview = jsonMutation("/api/go/reviews", {
  request: CreateGoReviewRequestSchema,
  response: CreateGoReviewResponseSchema,
});

export function useCreateReview() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createReview,
    onSuccess: () => client.invalidateQueries({ queryKey: qk.goReviews() }),
  });
}
