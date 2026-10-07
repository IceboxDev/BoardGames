import type {
  CardArticles,
  CardQuestions,
  TimelineIndex,
  Titles,
} from "@boardgames/core/games/quiztopia/content-types";
import { type QueryClient, queryOptions, useQuery } from "@tanstack/react-query";
import { qk } from "../../../lib/query-keys";
import { loadArticles, loadQuestions, loadTimeline, loadTitles } from "../content";

// Content chunks as React Query data — the ONE cache for them (the loaders in
// `content.ts` keep nothing). Content is immutable for a build, hence
// `Infinity` on both timers; a failed chunk is not cached, so the next mount
// or prefetch retries it. Warm-ups go through `prefetch*` below so they land
// in the same entries the screens read.

const IMMUTABLE = { staleTime: Number.POSITIVE_INFINITY, gcTime: Number.POSITIVE_INFINITY };

export const cardQuestionsQuery = (cardId: string) =>
  queryOptions<CardQuestions>({
    queryKey: qk.quiztopiaContent("questions", cardId),
    queryFn: () => loadQuestions(cardId),
    ...IMMUTABLE,
  });

export const cardArticlesQuery = (cardId: string) =>
  queryOptions<CardArticles>({
    queryKey: qk.quiztopiaContent("articles", cardId),
    queryFn: () => loadArticles(cardId),
    ...IMMUTABLE,
  });

export const titlesQuery = () =>
  queryOptions<Titles>({
    queryKey: qk.quiztopiaContent("titles", "all"),
    queryFn: loadTitles,
    ...IMMUTABLE,
  });

export const timelineIndexQuery = () =>
  queryOptions<TimelineIndex>({
    queryKey: qk.quiztopiaContent("timeline", "all"),
    queryFn: loadTimeline,
    ...IMMUTABLE,
  });

export function useCardQuestions(cardId: string | null | undefined, enabled = true) {
  return useQuery({ ...cardQuestionsQuery(cardId ?? ""), enabled: enabled && !!cardId });
}

export function useCardArticles(cardId: string | null | undefined, enabled = true) {
  return useQuery({ ...cardArticlesQuery(cardId ?? ""), enabled: enabled && !!cardId });
}

export function useTitles(enabled = true) {
  return useQuery({ ...titlesQuery(), enabled });
}

/** questionId → event for every dated question (empty before the enrichment lands). */
export function useTimelineIndex(enabled = true) {
  return useQuery({ ...timelineIndexQuery(), enabled });
}

/** Fire-and-forget warm-up of a card's questions (a failure is simply retried on use). */
export function prefetchCardQuestions(qc: QueryClient, cardId: string): void {
  void qc.prefetchQuery(cardQuestionsQuery(cardId));
}

export function prefetchCardArticles(qc: QueryClient, cardId: string): void {
  void qc.prefetchQuery(cardArticlesQuery(cardId));
}
