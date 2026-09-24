import type {
  CardArticles,
  CardQuestions,
  TimelineIndex,
  Titles,
} from "@boardgames/core/games/quiztopia/content-types";
import { useQuery } from "@tanstack/react-query";
import { qk } from "../../../lib/query-keys";
import { loadArticles, loadQuestions, loadTimeline, loadTitles } from "../content";

// Content chunks as React Query data. The chunk loaders already memoise
// their promises, so the cache here mostly buys the screens a uniform
// `isPending / data` shape and a place for `enabled` gating. Content is
// immutable for a build, hence `Infinity` on both timers.

const IMMUTABLE = { staleTime: Number.POSITIVE_INFINITY, gcTime: Number.POSITIVE_INFINITY };

export function useCardQuestions(cardId: string | null | undefined, enabled = true) {
  return useQuery<CardQuestions>({
    queryKey: qk.quiztopiaContent("questions", cardId ?? ""),
    queryFn: () => loadQuestions(cardId ?? ""),
    enabled: enabled && !!cardId,
    ...IMMUTABLE,
  });
}

export function useCardArticles(cardId: string | null | undefined, enabled = true) {
  return useQuery<CardArticles>({
    queryKey: qk.quiztopiaContent("articles", cardId ?? ""),
    queryFn: () => loadArticles(cardId ?? ""),
    enabled: enabled && !!cardId,
    ...IMMUTABLE,
  });
}

export function useTitles(enabled = true) {
  return useQuery<Titles>({
    queryKey: qk.quiztopiaContent("titles", "all"),
    queryFn: () => loadTitles(),
    enabled,
    ...IMMUTABLE,
  });
}

/** questionId → event for every dated question (empty before the enrichment lands). */
export function useTimelineIndex(enabled = true) {
  return useQuery<TimelineIndex>({
    queryKey: qk.quiztopiaContent("timeline", "all"),
    queryFn: () => loadTimeline(),
    enabled,
    ...IMMUTABLE,
  });
}
