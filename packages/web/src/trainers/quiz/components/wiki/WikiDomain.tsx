import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { CheckIcon } from "../../../../components/icons";
import {
  Eyebrow,
  InteractiveCard,
  MicroLabel,
  PageHeader,
  PageMain,
  ProgressBar,
  QueryBoundary,
  SearchInput,
  Select,
} from "../../../../components/ui";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { cn } from "../../../../lib/cn";
import { qk } from "../../../../lib/query-keys";
import { wikiReadsQuery } from "../../api";
import { coreToneOf, type Domain, findDomain, subName, TONE_STRIP } from "../../domains";
import { useQuizIndex } from "../../hooks/useContent";
import { usePrimaryLanguage } from "../../hooks/useQuestionLanguage";
import { fieldIn, inLang } from "../../logic/text";
import { useTrainerPaths } from "../../paths";
import { PrimaryLanguageToggle } from "../common/LanguageToggle";
import { TrainerScreen } from "../trainer/TrainerScreen";
import { foldText } from "./highlight";

// One domain's articles as a list, grouped by sub-category: title in the
// chosen language, how many facts it covers, read marker. Filter as you
// type; sort by sub-category, title or unread first. Per-row progress dots
// are deliberately absent — hundreds of rows would mean hundreds of state
// requests; the article page shows them instead.

type Sort = "sub" | "title" | "unread";

export default function WikiDomain() {
  const { domain } = useParams<{ domain: string }>();
  const paths = useTrainerPaths();
  const d = findDomain(domain);
  if (!d) return <Navigate to={paths.wiki} replace />;
  return <DomainScreen domain={d} />;
}

function DomainScreen({ domain: d }: { domain: Domain }) {
  useDocumentTitle(`${d.en} · The Archive`);
  const paths = useTrainerPaths();
  const { language, setPrimary } = usePrimaryLanguage();
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<Sort>("sub");

  const index = useQuizIndex();
  const reads = useQuery({
    queryKey: qk.quizWikiReads(),
    queryFn: wikiReadsQuery(),
    staleTime: 60_000,
  });
  const readSet = useMemo(
    () => new Set((reads.data?.reads ?? []).map((r) => r.articleId)),
    [reads.data],
  );

  const articles = useMemo(
    () => (index.data?.articles ?? []).filter((a) => a.domain === d.slug),
    [index.data, d.slug],
  );
  const subOrder = useMemo(() => d.subs.map((s) => s.slug), [d]);

  const rows = useMemo(() => {
    const needle = foldText(filter.trim());
    const list = articles
      .map((a, order) => ({
        id: a.id,
        sub: a.sub,
        title: fieldIn(a, "title", language),
        facts: a.factIds.length,
        order,
        read: readSet.has(a.id),
      }))
      .filter((r) => !needle || foldText(r.title).includes(needle));
    if (sort === "title") list.sort((a, b) => a.title.localeCompare(b.title) || a.order - b.order);
    else if (sort === "unread") {
      list.sort((a, b) => Number(a.read) - Number(b.read) || a.order - b.order);
    } else {
      list.sort(
        (a, b) =>
          subOrder.indexOf(a.sub) - subOrder.indexOf(b.sub) ||
          a.title.localeCompare(b.title) ||
          a.order - b.order,
      );
    }
    return list;
  }, [articles, language, filter, sort, readSet, subOrder]);

  const readCount = articles.filter((a) => readSet.has(a.id)).length;

  return (
    <TrainerScreen>
      <PageMain width="3xl" className="flex flex-col gap-5 pb-12">
        <div className="flex flex-col gap-3">
          <span
            className={cn("block h-1 w-full rounded-full", TONE_STRIP[d.tone])}
            aria-hidden="true"
          />
          <Eyebrow tone={coreToneOf(d.tone)}>{d.label} · The Archive</Eyebrow>
          <PageHeader
            size="md"
            title={inLang(language, d)}
            subtitle={`${articles.length} articles · ${readCount} read`}
            actions={<PrimaryLanguageToggle value={language} onChange={setPrimary} />}
          />
          <ProgressBar
            value={articles.length > 0 ? readCount / articles.length : 0}
            tone={coreToneOf(d.tone)}
            label="Articles read"
            animate={false}
          />
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            containerClassName="flex-1"
            aria-label="Filter articles"
            placeholder="Filter by title"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <Select
            aria-label="Sort articles"
            size="sm"
            block={false}
            chevron
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
          >
            <option value="sub">Topic</option>
            <option value="title">Title</option>
            <option value="unread">Unread first</option>
          </Select>
        </div>

        <QueryBoundary query={index} loadingLabel="Opening the index…">
          {() => (
            <ol className="flex flex-col gap-1.5" aria-label={`${d.en} articles`}>
              {rows.map((r, i) => (
                <Fragment key={r.id}>
                  {sort === "sub" && rows[i - 1]?.sub !== r.sub && (
                    <li className={cn(i > 0 && "pt-3")}>
                      <MicroLabel>{subName(d, r.sub, language)}</MicroLabel>
                    </li>
                  )}
                  <li>
                    <InteractiveCard
                      as={Link}
                      to={paths.wikiArticle(r.id)}
                      padding="none"
                      className="flex items-center gap-3 px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-fg-primary group-hover:text-fg-strong">
                        {r.title}
                      </span>
                      <MicroLabel className="shrink-0 tabular-nums" title="Facts it covers">
                        {r.facts}
                      </MicroLabel>
                      {r.read ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-2xs font-medium text-emerald-300">
                          <CheckIcon className="h-3.5 w-3.5" />
                          <span className="sr-only">Read</span>
                        </span>
                      ) : (
                        <span
                          className="block h-1.5 w-1.5 shrink-0 rounded-full border border-line-strong"
                          title="Unread"
                        />
                      )}
                    </InteractiveCard>
                  </li>
                </Fragment>
              ))}
              {rows.length === 0 && (
                <li className="py-6 text-center text-sm text-fg-muted">
                  No article matches “{filter.trim()}”.
                </li>
              )}
            </ol>
          )}
        </QueryBoundary>
      </PageMain>
    </TrainerScreen>
  );
}
