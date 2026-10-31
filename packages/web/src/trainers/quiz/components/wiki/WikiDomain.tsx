import { useQuery } from "@tanstack/react-query";
import { Fragment, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { QueryBoundary } from "../../../../components/ui";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { cn } from "../../../../lib/cn";
import { qk } from "../../../../lib/query-keys";
import { wikiReadsQuery } from "../../api";
import { type Domain, findDomain, subName } from "../../domains";
import { useQuizIndex } from "../../hooks/useContent";
import { usePrimaryLanguage } from "../../hooks/useQuestionLanguage";
import { fieldIn, inLang } from "../../logic/text";
import { useTrainerPaths } from "../../paths";
import { DomainIcon } from "../common/DomainIcon";
import { PrimaryLanguageToggle } from "../common/LanguageToggle";
import { Headline, InkMeter, PaperNote, PaperSearch, PaperTabs } from "../paper/Paper";
import { PaperPage } from "../paper/PaperPage";
import { KICKER } from "../paper/paper-style";
import { TrainerScreen } from "../trainer/TrainerScreen";
import { foldText } from "./highlight";

// One section's page of the archive: its articles as a newspaper index in
// columns, grouped by sub-category: title in the chosen language, a dotted
// leader to how many facts it covers, read tick. Filter as you
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
      <PaperPage pageLabel={d.en} folio="B2" current="archive" className="gap-4">
        <header className="flex flex-col gap-3">
          <div className="flex items-start gap-4">
            <DomainIcon domain={d.slug} size={56} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <Link to={paths.wiki} className={cn(KICKER, "text-fg-muted hover:text-fg-strong")}>
                The Archive · Section {d.label}
              </Link>
              <Headline as="h1" size="lg">
                {inLang(language, d)}
              </Headline>
              <p className="font-news text-sm italic text-fg-secondary">
                {articles.length} articles · {readCount} read
              </p>
            </div>
            <PrimaryLanguageToggle value={language} onChange={setPrimary} />
          </div>
          <InkMeter value={articles.length > 0 ? readCount / articles.length : 0} domain={d.slug} />
        </header>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <PaperSearch
            className="sm:w-96"
            label="Filter articles"
            placeholder="Filter by title"
            value={filter}
            onChange={setFilter}
          />
          <PaperTabs<Sort>
            label="Sort articles"
            value={sort}
            onChange={setSort}
            options={[
              { value: "sub", label: "Topic" },
              { value: "title", label: "Title" },
              { value: "unread", label: "Unread first" },
            ]}
          />
        </div>

        <QueryBoundary query={index} loadingLabel="Opening the index…">
          {() =>
            rows.length === 0 ? (
              <PaperNote>No article matches “{filter.trim()}”.</PaperNote>
            ) : (
              <ol
                className="font-news text-sm md:cols-news-2 xl:cols-news-3"
                aria-label={`${d.en} articles`}
              >
                {rows.map((r, i) => (
                  <Fragment key={r.id}>
                    {sort === "sub" && rows[i - 1]?.sub !== r.sub && (
                      <li
                        className={cn(
                          KICKER,
                          d.ink,
                          "break-after-avoid border-b border-fg-primary pb-0.5",
                          i > 0 && "mt-4",
                        )}
                      >
                        {subName(d, r.sub, language)}
                      </li>
                    )}
                    <li className="break-inside-avoid">
                      <Link
                        to={paths.wikiArticle(r.id)}
                        className="group flex items-baseline gap-1.5 py-1 text-fg-primary hover:text-fg-strong focus-visible:outline-2 focus-visible:outline-accent-400"
                      >
                        <span className="min-w-0 truncate group-hover:underline">{r.title}</span>
                        <span
                          aria-hidden="true"
                          className="min-w-4 flex-1 border-b border-dotted border-line-strong"
                        />
                        <span
                          className="shrink-0 tabular-nums text-fg-muted"
                          title="Facts it covers"
                        >
                          {r.facts}
                        </span>
                        <span
                          className={cn(
                            "w-3 shrink-0 text-center",
                            r.read ? d.ink : "text-fg-disabled",
                          )}
                          title={r.read ? "Read" : "Unread"}
                        >
                          {r.read ? "✓" : "○"}
                          <span className="sr-only">{r.read ? "Read" : "Unread"}</span>
                        </span>
                      </Link>
                    </li>
                  </Fragment>
                ))}
              </ol>
            )
          }
        </QueryBoundary>
      </PaperPage>
    </TrainerScreen>
  );
}
