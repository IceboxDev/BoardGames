import {
  QUIZ_DESK_RETIRED_KINDS,
  type QuizDeskRetiredQuery,
  type QuizDeskRetiredRow,
  RETIRED_CODE_FILTERS,
  type RetiredCodeFilter,
  RetiredCodeFilterSchema,
} from "@boardgames/core/protocol/http/quiz-desk";
import { QuizDomainSchema } from "@boardgames/core/protocol/http/trainer-quiz";
import { sourceById } from "@boardgames/core/quiz/sources";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { TextLink } from "../../../trainers/quiz/components/common/TextLink";
import { DOMAINS, findDomain } from "../../../trainers/quiz/domains";
import { TRAINER_BASE, trainerPaths } from "../../../trainers/quiz/paths";
import {
  Badge,
  Button,
  EmptyState,
  MicroLabel,
  QueryBoundary,
  SearchInput,
  SegmentedControl,
  Select,
  Surface,
} from "../../ui";
import { deskKeys, useQuizDeskApi } from "./api";
import { DeskLinkButton } from "./bits";

// The retired database: every fact, wording and article out of play, with
// its code, reason, what replaced it and the card that printed it.

const PAGE = 50;
const PATHS = trainerPaths(TRAINER_BASE);

type KindFilter = (typeof QUIZ_DESK_RETIRED_KINDS)[number] | "all";

function ReplacedBy({
  row,
  onOpenArticle,
}: {
  row: QuizDeskRetiredRow;
  onOpenArticle: (articleId: string) => void;
}) {
  if (!row.replacedBy?.length) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted">
      now:
      {row.replacedBy.map((id) =>
        /^a\d{4,}$/.test(id) ? (
          <DeskLinkButton key={id} onClick={() => onOpenArticle(id)}>
            {id}
          </DeskLinkButton>
        ) : /^f\d{5,}$/.test(id) ? (
          <TextLink key={id} to={PATHS.wikiFact(id)}>
            {id} →
          </TextLink>
        ) : (
          <span key={id}>{id}</span>
        ),
      )}
    </span>
  );
}

function RetiredRowView({
  row,
  onOpenArticle,
}: {
  row: QuizDeskRetiredRow;
  onOpenArticle: (articleId: string) => void;
}) {
  const game = row.printed ? (sourceById(row.printed.source)?.title ?? row.printed.source) : null;
  return (
    <li className="flex flex-col gap-1 py-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone="neutral" size="xs">
          {row.kind}
        </Badge>
        <MicroLabel className="tabular-nums">{row.id}</MicroLabel>
        <Badge tone={row.code ? "rose" : "neutral"} size="xs">
          {row.code ?? "no code"}
        </Badge>
        {row.inRetiredArticle && row.kind !== "article" && (
          <Badge tone="orange" size="xs">
            article retired
          </Badge>
        )}
        <MicroLabel className="ml-auto tabular-nums">
          {row.at} · {findDomain(row.domain)?.en ?? row.domain}
        </MicroLabel>
      </div>
      <p className="text-sm text-fg-primary">
        {row.question ? row.question.en : row.articleTitle.en}
      </p>
      {row.answer && <p className="text-xs font-medium text-fg-secondary">→ {row.answer.en}</p>}
      <p className="text-xs leading-snug text-fg-secondary">{row.reason}</p>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
        <DeskLinkButton
          onClick={() => onOpenArticle(row.articleId)}
          title="Open the article's provenance"
        >
          {row.articleId} · {row.articleTitle.en}
        </DeskLinkButton>
        <ReplacedBy row={row} onOpenArticle={onOpenArticle} />
        {row.printed && (
          <MicroLabel>
            {game} {row.printed.card} · cat {row.printed.category}
          </MicroLabel>
        )}
      </div>
    </li>
  );
}

export function RetiredTab({ onOpenArticle }: { onOpenArticle: (articleId: string) => void }) {
  const api = useQuizDeskApi();
  const [kind, setKind] = useState<KindFilter>("all");
  const [code, setCode] = useState<RetiredCodeFilter | "">("");
  const [domain, setDomain] = useState("");
  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q.trim());
  const filter: QuizDeskRetiredQuery = {
    kind: kind === "all" ? undefined : kind,
    code: code || undefined,
    domain: QuizDomainSchema.safeParse(domain).data,
    q: deferredQ || undefined,
    limit: PAGE,
  };
  const query = useInfiniteQuery({
    queryKey: deskKeys.retired(api.id, filter),
    queryFn: ({ pageParam, signal }) => api.retired({ ...filter, cursor: pageParam }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  return (
    <div className="flex flex-col gap-3">
      <Surface variant="tile" padding="md" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl<KindFilter>
            aria-label="Kind"
            size="xs"
            shape="pill"
            options={[
              { value: "all", label: "All" },
              ...QUIZ_DESK_RETIRED_KINDS.map((k) => ({ value: k, label: `${k}s` })),
            ]}
            value={kind}
            onChange={setKind}
          />
          <Select
            size="sm"
            block={false}
            aria-label="Retirement code"
            value={code}
            onChange={(e) => setCode(RetiredCodeFilterSchema.safeParse(e.target.value).data ?? "")}
          >
            <option value="">Every code</option>
            {RETIRED_CODE_FILTERS.map((c) => (
              <option key={c} value={c}>
                {c === "none" ? "no code" : c}
              </option>
            ))}
          </Select>
          <Select
            size="sm"
            block={false}
            aria-label="Domain"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
          >
            <option value="">Every domain</option>
            {DOMAINS.map((d) => (
              <option key={d.slug} value={d.slug}>
                {d.en}
              </option>
            ))}
          </Select>
        </div>
        <SearchInput
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search id, question, answer, title or reason"
          aria-label="Search retired items"
        />
      </Surface>

      <QueryBoundary query={query} loadingLabel="Loading retired items…">
        {(data) => {
          const rows = data.pages.flatMap((p) => p.rows);
          if (rows.length === 0) {
            return (
              <EmptyState titleAs="h3" title="Nothing here" description="No retired items match." />
            );
          }
          const total = data.pages[0]?.total ?? rows.length;
          return (
            <Surface variant="panel" padding="none" className="px-3">
              <MicroLabel as="p" className="pt-2">
                {total} retired item{total === 1 ? "" : "s"}
              </MicroLabel>
              <ul className="flex flex-col divide-y divide-line-soft">
                {rows.map((r) => (
                  <RetiredRowView key={`${r.kind}-${r.id}`} row={r} onOpenArticle={onOpenArticle} />
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
