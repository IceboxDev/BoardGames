import type { TrainerOverview } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { cn } from "../../../../lib/cn";
import { qk } from "../../../../lib/query-keys";
import { overviewQuery, todayKey, wikiReadsQuery } from "../../api";
import { CONTENT_META } from "../../content";
import { DOMAINS } from "../../domains";
import { useQuizIndex } from "../../hooks/useContent";
import { useJournal } from "../../hooks/useJournal";
import { useMyReports } from "../../hooks/useMyReports";
import { useQuizSettings } from "../../hooks/useQuizSettings";
import { fieldIn, inLang } from "../../logic/text";
import { dayLabel } from "../../logic/time";
import { useTrainerPaths } from "../../paths";
import { DomainIcon } from "../common/DomainIcon";
import { Headline, InkMeter, PaperSearch, SectionHead } from "../paper/Paper";
import { PaperPage } from "../paper/PaperPage";
import { KICKER } from "../paper/paper-style";
import { UnreadDot } from "../report/UnreadDot";
import { TrainerScreen } from "../trainer/TrainerScreen";

// The archive's front page (B1): the search line, the fourteen sections as
// a ruled index with how much of each has been read (a section read to the
// end is marked complete), and beside it the latest back issue and the
// letters to the editor.

export default function WikiIndex() {
  useDocumentTitle("The Archive · Quiz");
  const navigate = useNavigate();
  const paths = useTrainerPaths();
  const { settings } = useQuizSettings();
  const lang = settings.language.primary;
  const [q, setQ] = useState("");

  const reads = useQuery({
    queryKey: qk.quizWikiReads(),
    queryFn: wikiReadsQuery(),
    staleTime: 60_000,
  });
  const index = useQuizIndex();
  const { articlesByDomain, readByDomain } = useMemo(() => {
    const articles = new Map<string, number>();
    const domainOfArticle = new Map<string, string>();
    for (const a of index.data?.articles ?? []) {
      articles.set(a.domain, (articles.get(a.domain) ?? 0) + 1);
      domainOfArticle.set(a.id, a.domain);
    }
    const read = new Map<string, number>();
    for (const r of reads.data?.reads ?? []) {
      const domain = domainOfArticle.get(r.articleId);
      if (domain) read.set(domain, (read.get(domain) ?? 0) + 1);
    }
    return { articlesByDomain: articles, readByDomain: read };
  }, [index.data, reads.data]);
  const totalRead = reads.data?.reads.length ?? 0;
  const today = useMemo(() => todayKey(), []);
  const overview = useQuery({
    queryKey: qk.quizOverview(today),
    queryFn: overviewQuery(today),
    staleTime: 30_000,
  });
  const factsByDomain = useMemo(
    () => new Map((overview.data?.domains ?? []).map((c) => [c.domain, c])),
    [overview.data],
  );

  return (
    <TrainerScreen>
      <PaperPage pageLabel="The Archive" folio="B1" current="archive" fill className="gap-4">
        <header className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end lg:gap-6 xl:grid-cols-[minmax(0,1fr)_14rem_14rem_18rem]">
          <div className="flex min-w-0 flex-col gap-1">
            <Headline as="h1" size="lg">
              The Archive
            </Headline>
            <p className="font-news text-sm italic text-fg-secondary">
              {CONTENT_META.counts.articles.toLocaleString()} articles in {DOMAINS.length} sections,
              every answer underlined where the text gives it away.
            </p>
          </div>
          <LatestIssueEar lang={lang} />
          <LettersEar />
          <PaperSearch
            className="lg:w-80 xl:w-auto"
            label="Search the archive"
            placeholder="Questions, answers and titles"
            value={q}
            onChange={setQ}
            minLength={2}
            onSubmit={() => {
              if (q.trim().length >= 2) navigate(paths.search(q.trim()));
            }}
          />
        </header>

        <section aria-label="Sections" className="flex min-h-0 min-w-0 flex-1 flex-col gap-2">
          <SectionHead right="articles read · facts learnt · cards due">Sections</SectionHead>
          <ul className="grid flex-1 auto-rows-fr grid-cols-2 border-l border-t border-line-strong sm:grid-cols-3 lg:min-h-0 lg:grid-cols-5 lg:grid-rows-3">
            {DOMAINS.map((d) => {
              const total = articlesByDomain.get(d.slug) ?? 0;
              const read = readByDomain.get(d.slug) ?? 0;
              const c = factsByDomain.get(d.slug);
              const learnt = c && c.total > 0 ? Math.round((c.known / c.total) * 100) : 0;
              const complete = total > 0 && read >= total;
              return (
                <li
                  key={d.slug}
                  className="flex min-h-0 overflow-hidden border-b border-r border-line-strong"
                >
                  <Link
                    to={paths.wikiDomain(d.slug)}
                    className={cn(
                      "group flex w-full flex-col gap-1.5 p-2.5 hover:bg-fill-soft roomy:gap-2 roomy:p-3 focus-visible:outline-2 focus-visible:outline-accent-400",
                      complete && "border-3 border-double border-fg-primary",
                    )}
                  >
                    <span className="flex items-start gap-3">
                      <DomainIcon domain={d.slug} size={56} className="size-11 roomy:size-16" />
                      <span className="flex min-w-0 flex-col gap-1">
                        <Headline
                          as="h2"
                          size="sm"
                          className="text-base leading-tight group-hover:text-accent-200"
                        >
                          {inLang(lang, d)}
                        </Headline>
                        <span className="line-clamp-1 font-news text-xs italic leading-snug text-fg-muted roomy:line-clamp-2">
                          {d.subs.map((x) => x[lang]).join(" · ")}
                        </span>
                      </span>
                    </span>
                    <span className="mt-auto flex flex-col gap-1.5">
                      <span className="grid grid-cols-3 gap-1">
                        <Figure
                          value={complete ? "✓" : read}
                          label="read"
                          ink={complete ? d.ink : undefined}
                        />
                        <Figure value={`${learnt}%`} label="learnt" />
                        <Figure
                          value={c?.due ?? 0}
                          label="due"
                          ink={c && c.due > 0 ? "text-sky-300" : undefined}
                        />
                      </span>
                      <InkMeter value={total > 0 ? read / total : 0} domain={d.slug} />
                    </span>
                  </Link>
                </li>
              );
            })}
            <li className="col-span-2 flex border-b border-r border-line-strong sm:col-span-1">
              <WholeArchive
                articles={CONTENT_META.counts.articles}
                read={totalRead}
                readByDomain={readByDomain}
                articlesByDomain={articlesByDomain}
                overview={overview.data ?? null}
              />
            </li>
          </ul>
        </section>
      </PaperPage>
    </TrainerScreen>
  );
}

/** A small figure in a section's cell: the number over its caption. */
function Figure({ value, label, ink }: { value: string | number; label: string; ink?: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span
        className={cn(
          "font-headline text-base font-bold leading-none tabular-nums roomy:text-lg",
          ink ?? "text-fg-strong",
        )}
      >
        {value}
      </span>
      <span className={cn(KICKER, "truncate text-fg-muted")}>{label}</span>
    </span>
  );
}

/** The fifteenth cell: the archive as a whole, with each section's reading as an ink bar. */
function WholeArchive({
  articles,
  read,
  readByDomain,
  articlesByDomain,
  overview,
}: {
  articles: number;
  read: number;
  readByDomain: ReadonlyMap<string, number>;
  articlesByDomain: ReadonlyMap<string, number>;
  overview: TrainerOverview | null;
}) {
  const known = overview?.domains.reduce((n, c) => n + c.known, 0) ?? 0;
  const facts = overview?.domains.reduce((n, c) => n + c.total, 0) ?? 0;
  const due = overview?.domains.reduce((n, c) => n + c.due, 0) ?? 0;
  return (
    <div className="flex w-full flex-col gap-2 bg-fill-soft p-3">
      <span className={cn(KICKER, "text-accent-300")}>The whole archive</span>
      <span className="font-headline text-2xl font-black leading-none tabular-nums text-fg-strong">
        {read.toLocaleString("en")}
        <span className="font-news text-sm font-normal italic text-fg-muted">
          {" "}
          of {articles.toLocaleString("en")} read
        </span>
      </span>
      <div
        aria-hidden="true"
        className="flex min-h-6 flex-1 items-end gap-0.5 border-b border-fg-primary/60"
      >
        {DOMAINS.map((d) => {
          const total = articlesByDomain.get(d.slug) ?? 0;
          const share = total > 0 ? (readByDomain.get(d.slug) ?? 0) / total : 0;
          return (
            <span
              key={d.slug}
              title={`${d.en}: ${Math.round(share * 100)}% read`}
              className="min-w-0 flex-1"
              style={{ height: `${Math.max(4, share * 100)}%`, backgroundColor: d.color }}
            />
          );
        })}
      </div>
      <span className="grid grid-cols-2 gap-1">
        <Figure
          value={known.toLocaleString("en")}
          label={`of ${facts.toLocaleString("en")} learnt`}
        />
        <Figure value={due} label="cards due" ink={due > 0 ? "text-sky-300" : undefined} />
      </span>
    </div>
  );
}

/** A boxed ear in the page head, the way a paper flags what's inside. */
function EarLink({
  to,
  title,
  line,
  note,
  unread = 0,
}: {
  to: string;
  title: string;
  line: string;
  note: string;
  unread?: number;
}) {
  return (
    <Link
      to={to}
      className="group relative hidden min-w-0 flex-col gap-0.5 border border-line-strong px-3 py-2 hover:border-fg-primary focus-visible:outline-2 focus-visible:outline-accent-400 xl:flex"
    >
      <span className={cn(KICKER, "truncate text-accent-300")}>{title} ▸</span>
      <span className="truncate font-news text-sm text-fg-primary group-hover:text-fg-strong">
        {line}
      </span>
      <span className="truncate font-news text-xs italic text-fg-muted">{note}</span>
      <UnreadDot count={unread} />
    </Link>
  );
}

/** The latest day of the back issues, as an ear. */
function LatestIssueEar({ lang }: { lang: "en" | "de" | "ru" }) {
  const paths = useTrainerPaths();
  const journal = useJournal();
  const today = useMemo(() => todayKey(), []);
  const latest = journal.days[0];
  return (
    <EarLink
      to={paths.journal}
      title="Latest back issue"
      line={
        latest
          ? `${dayLabel(latest.date, today)} · ${latest.articles.length} ${latest.articles.length === 1 ? "article" : "articles"}`
          : "No back issues yet"
      }
      note={
        latest?.articles[0]
          ? fieldIn(latest.articles[0], "title", lang)
          : "Every day you study is filed here"
      }
    />
  );
}

/** Your reports, as the letters page's ear. */
function LettersEar() {
  const paths = useTrainerPaths();
  const { reports, unread } = useMyReports();
  const open = reports.filter((r) => r.status === "open").length;
  return (
    <EarLink
      to={paths.reports}
      title="Letters to the editor"
      line={
        reports.length === 0
          ? "No letters yet"
          : `${reports.length} ${reports.length === 1 ? "letter" : "letters"} · ${open} awaiting`
      }
      note={
        unread > 0
          ? `${unread} new ${unread === 1 ? "reply" : "replies"}`
          : "Flag a mistake from any page"
      }
      unread={unread}
    />
  );
}
