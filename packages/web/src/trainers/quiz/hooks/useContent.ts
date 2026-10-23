import type { Article, TimelineIndex } from "@boardgames/core/quiz/content-types";
import { type QueryClient, queryOptions, useQuery } from "@tanstack/react-query";
import { qk } from "../../../lib/query-keys";
import { loadArticle, loadIndex, loadTimeline, type QuizIndex } from "../content";

// Content chunks as React Query data — the ONE cache for them (the loaders in
// `content.ts` keep nothing). Content is immutable for a build, hence
// `Infinity` on both timers; a failed chunk is not cached, so the next mount
// or prefetch retries it. Warm-ups go through `prefetch*` below so they land
// in the same entries the screens read.

const IMMUTABLE = { staleTime: Number.POSITIVE_INFINITY, gcTime: Number.POSITIVE_INFINITY };

export const articleQuery = (id: string) =>
  queryOptions<Article>({
    queryKey: qk.quizContent("article", id),
    queryFn: () => loadArticle(id),
    ...IMMUTABLE,
  });

export const indexQuery = () =>
  queryOptions<QuizIndex>({
    queryKey: qk.quizContent("index", "all"),
    queryFn: loadIndex,
    ...IMMUTABLE,
  });

export const timelineIndexQuery = () =>
  queryOptions<TimelineIndex>({
    queryKey: qk.quizContent("timeline", "all"),
    queryFn: loadTimeline,
    ...IMMUTABLE,
  });

export function useArticle(id: string | null | undefined, enabled = true) {
  return useQuery({ ...articleQuery(id ?? ""), enabled: enabled && !!id });
}

/** The bank's index: every article's titles, domain and fact ids. */
export function useQuizIndex(enabled = true) {
  return useQuery({ ...indexQuery(), enabled });
}

/** factId → event for every fact. */
export function useTimelineIndex(enabled = true) {
  return useQuery({ ...timelineIndexQuery(), enabled });
}

/** Fire-and-forget warm-up of an article (a failure is simply retried on use). */
export function prefetchArticle(qc: QueryClient, id: string): void {
  void qc.prefetchQuery(articleQuery(id));
}
