import type {
  QuizDeskBacklogQuery,
  QuizDeskTargetLabel,
} from "@boardgames/core/protocol/http/quiz-desk";
import {
  BACKLOG_KINDS,
  BACKLOG_STATUSES,
  type BacklogKind,
  type BacklogStatus,
} from "@boardgames/core/quiz/backlog-types";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Button,
  Chip,
  EmptyState,
  MicroLabel,
  QueryBoundary,
  SearchInput,
  Surface,
} from "../../ui";
import { deskKeys, useQuizDeskApi } from "./api";
import { BacklogRow } from "./bits";

// The backlog, filterable by status, kind and target (an article id also
// matches everything inside it). Priority first, then newest.

const PAGE = 50;

export function BacklogTab({ onOpenArticle }: { onOpenArticle: (articleId: string) => void }) {
  const api = useQuizDeskApi();
  const [status, setStatus] = useState<BacklogStatus | null>("open");
  const [kind, setKind] = useState<BacklogKind | null>(null);
  const [target, setTarget] = useState("");
  const filter: QuizDeskBacklogQuery = {
    status: status ?? undefined,
    kind: kind ?? undefined,
    target: target.trim() || undefined,
    limit: PAGE,
  };
  const query = useInfiniteQuery({
    queryKey: deskKeys.backlog(api.id, filter),
    queryFn: ({ pageParam, signal }) => api.backlog({ ...filter, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const first = query.data?.pages[0];

  return (
    <div className="flex flex-col gap-3">
      <Surface variant="tile" padding="md" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <MicroLabel className="w-12 shrink-0">Status</MicroLabel>
          <Chip size="xs" pressed={status === null} onClick={() => setStatus(null)}>
            all
          </Chip>
          {BACKLOG_STATUSES.map((s) => (
            <Chip
              key={s}
              size="xs"
              tone="amber"
              pressed={status === s}
              onClick={() => setStatus(status === s ? null : s)}
            >
              {s}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <MicroLabel className="w-12 shrink-0">Kind</MicroLabel>
          <Chip size="xs" pressed={kind === null} onClick={() => setKind(null)}>
            all
          </Chip>
          {BACKLOG_KINDS.map((k) => (
            <Chip
              key={k}
              size="xs"
              tone="sky"
              pressed={kind === k}
              onClick={() => setKind(kind === k ? null : k)}
            >
              {k}
            </Chip>
          ))}
        </div>
        <SearchInput
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="Target: a0042, f00123, quiztopia/c042, domain:history…"
          aria-label="Filter by target"
        />
      </Surface>

      <QueryBoundary query={query} loadingLabel="Loading the backlog…">
        {(data) => {
          const items = data.pages.flatMap((p) => p.items);
          const targets: Record<string, QuizDeskTargetLabel> = {};
          for (const p of data.pages) Object.assign(targets, p.targets);
          if (items.length === 0) {
            return (
              <EmptyState titleAs="h3" title="Nothing here" description="No backlog items match." />
            );
          }
          return (
            <Surface variant="panel" padding="none" className="px-3">
              <MicroLabel as="p" className="pt-2">
                {first?.total ?? items.length} item{(first?.total ?? 0) === 1 ? "" : "s"}
              </MicroLabel>
              <ul className="flex flex-col divide-y divide-line-soft">
                {items.map((b) => (
                  <BacklogRow
                    key={b.id}
                    item={b}
                    label={targets[b.target]}
                    onOpenArticle={onOpenArticle}
                  />
                ))}
              </ul>
              {query.hasNextPage && (
                <div className="flex justify-center py-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={query.isFetchingNextPage}
                    onClick={() => void query.fetchNextPage()}
                  >
                    Show more
                  </Button>
                </div>
              )}
            </Surface>
          );
        }}
      </QueryBoundary>
    </div>
  );
}
