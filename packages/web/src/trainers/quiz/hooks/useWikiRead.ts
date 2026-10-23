import type { WikiReads } from "@boardgames/core/protocol";
import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { qk } from "../../../lib/query-keys";
import { deleteWikiRead, postWikiRead, wikiReadsQuery } from "../api";
import { invalidateAfterRead } from "../cache";

// One article's read mark: shown at once (optimistic), saved in order per
// article (`scope`, so a quick mark → unmark can't land reversed), and put
// right by a refetch when a save fails. Unmarking exists because the mark
// is also set automatically near the end of the article — a skim, or a
// stray tap on the chip, shouldn't count as reading it.

export function useWikiRead(articleId: string) {
  const qc = useQueryClient();
  const key = qk.quizWikiReads();
  const reads = useQuery({ queryKey: key, queryFn: wikiReadsQuery(), staleTime: 60_000 });
  const isRead = (reads.data?.reads ?? []).some((r) => r.articleId === articleId);

  const mutationKey = ["quiz", "wiki-read", articleId] as const;
  const isLast = () => qc.isMutating({ mutationKey }) <= 1;
  const mutation = useMutation({
    mutationKey,
    scope: { id: `quiz-wiki-read:${articleId}` },
    mutationFn: (read: boolean) =>
      read ? postWikiRead({ articleId }) : deleteWikiRead({ articleId }),
    onSuccess: (res) => {
      if (isLast()) qc.setQueryData<WikiReads>(key, res);
    },
    onError: () => {
      if (isLast()) void qc.invalidateQueries({ queryKey: key });
    },
    onSettled: () => {
      if (isLast()) void invalidateAfterRead(qc);
    },
  });
  const pending = useIsMutating({ mutationKey }) > 0;

  const { mutate } = mutation;
  const setRead = useCallback(
    (read: boolean) => {
      const current = qc.getQueryData<WikiReads>(qk.quizWikiReads());
      if (!current) return;
      if (current.reads.some((r) => r.articleId === articleId) === read) return;
      void qc.cancelQueries({ queryKey: qk.quizWikiReads() });
      qc.setQueryData<WikiReads>(qk.quizWikiReads(), {
        reads: read
          ? [...current.reads, { articleId, readAt: new Date().toISOString() }]
          : current.reads.filter((r) => r.articleId !== articleId),
      });
      mutate(read);
    },
    [qc, mutate, articleId],
  );

  return { isRead, loaded: reads.data !== undefined, setRead, pending, error: mutation.error };
}
