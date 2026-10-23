import { useQuery } from "@tanstack/react-query";
import { type FormEvent, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRightIcon, FlagIcon } from "../../../../components/icons";
import {
  Badge,
  Button,
  InteractiveCard,
  MicroLabel,
  PageHeader,
  PageMain,
  ProgressBar,
  SearchInput,
  TONE_BUBBLE,
} from "../../../../components/ui";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { cn } from "../../../../lib/cn";
import { qk } from "../../../../lib/query-keys";
import { todayKey, wikiReadsQuery } from "../../api";
import { CONTENT_META } from "../../content";
import { coreToneOf, DOMAINS, domainOf, TONE_LIT } from "../../domains";
import { useQuizIndex } from "../../hooks/useContent";
import { useJournal } from "../../hooks/useJournal";
import { useMyReports } from "../../hooks/useMyReports";
import { useQuizSettings } from "../../hooks/useQuizSettings";
import { fieldIn, inLang } from "../../logic/text";
import { dayLabel } from "../../logic/time";
import { useTrainerPaths } from "../../paths";
import { UnreadDot } from "../report/UnreadDot";
import { TrainerScreen } from "../trainer/TrainerScreen";

// The archive's front page: search, your journal's latest day (the way back
// to what you studied or read recently), and the domains with how much of
// each has been read. A domain lights up when every one of its articles has
// been read.

export default function WikiIndex() {
  useDocumentTitle("The Archive · Quiz");
  const navigate = useNavigate();
  const paths = useTrainerPaths();
  const { settings } = useQuizSettings();
  const lang = settings.language.primary;
  const [q, setQ] = useState("");
  const { unread: reportsUnread } = useMyReports();

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

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = q.trim();
    if (trimmed.length >= 2) navigate(paths.search(trimmed));
  };

  return (
    <TrainerScreen>
      <PageMain width="6xl" className="flex flex-col gap-6 pb-12">
        <PageHeader
          size="lg"
          eyebrow="Wiki"
          title="The Archive"
          subtitle={`${CONTENT_META.counts.articles.toLocaleString()} articles across ${DOMAINS.length} domains — every answer highlighted where the text gives it away.`}
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(paths.reports)}
                className="relative"
                title="Problems you've flagged, and what came of them"
              >
                <FlagIcon className="h-3.5 w-3.5" />
                Your reports
                <UnreadDot count={reportsUnread} />
              </Button>
              <Button variant="link" onClick={() => navigate(paths.hub)}>
                ← Trainer
              </Button>
            </div>
          }
        />

        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            containerClassName="flex-1"
            aria-label="Search the archive"
            placeholder="Search questions, answers and titles — Enter to search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={q.trim().length < 2}>
            Search
          </Button>
        </form>

        <JournalTeaser lang={lang} />

        <section aria-label="Domains" className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold text-fg-strong">Domains</h2>
            <MicroLabel className="tabular-nums">
              {totalRead} of {CONTENT_META.counts.articles} read
            </MicroLabel>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {DOMAINS.map((d) => {
              const total = articlesByDomain.get(d.slug) ?? 0;
              const read = readByDomain.get(d.slug) ?? 0;
              const lit = total > 0 && read >= total;
              return (
                <InteractiveCard
                  key={d.slug}
                  as={Link}
                  to={paths.wikiDomain(d.slug)}
                  padding="sm"
                  className={cn(
                    "flex h-full flex-col gap-3",
                    lit && cn("border", TONE_LIT[d.tone]),
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                      lit ? TONE_BUBBLE[d.tone] : "bg-fill text-fg-muted",
                    )}
                  >
                    {d.label}
                  </span>
                  <p className="truncate text-sm font-semibold text-fg-strong">{inLang(lang, d)}</p>
                  <div className="flex flex-col gap-1.5">
                    <MicroLabel className="tabular-nums">
                      {total} articles · {read} read
                    </MicroLabel>
                    <ProgressBar
                      value={total > 0 ? read / total : 0}
                      tone={coreToneOf(d.tone)}
                      label={`${d.en}: articles read`}
                      animate={false}
                    />
                  </div>
                  <span className="mt-auto flex items-center gap-1 pt-1 text-3xs font-semibold text-accent-300">
                    Browse
                    <ArrowRightIcon className="h-2.5 w-2.5" />
                  </span>
                </InteractiveCard>
              );
            })}
          </div>
        </section>
      </PageMain>
    </TrainerScreen>
  );
}

/** The latest day of the journal, its articles as tiles, and the way in. */
function JournalTeaser({ lang }: { lang: "en" | "de" | "ru" }) {
  const navigate = useNavigate();
  const paths = useTrainerPaths();
  const journal = useJournal();
  const today = useMemo(() => todayKey(), []);
  const latest = journal.days[0];
  return (
    <section aria-label="Your journal" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg-strong">Your journal</h2>
        <Button variant="link" size="sm" onClick={() => navigate(paths.journal)}>
          Open your journal →
        </Button>
      </div>
      {latest ? (
        <>
          <MicroLabel>
            {dayLabel(latest.date, today)} · {latest.articles.length}{" "}
            {latest.articles.length === 1 ? "article" : "articles"}
          </MicroLabel>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {latest.articles.slice(0, 4).map((set) => {
              const d = domainOf(set.domain);
              const missed = set.questions.filter((q) => q.grades.includes("again")).length;
              return (
                <li key={set.articleId}>
                  <InteractiveCard
                    as={Link}
                    to={paths.wikiArticle(set.articleId)}
                    padding="sm"
                    className="flex h-full flex-col gap-1"
                  >
                    <Badge tone={d.tone} size="xs" className="self-start">
                      {d.label} · {inLang(lang, d)}
                    </Badge>
                    <p className="line-clamp-2 text-sm font-medium text-fg-strong">
                      {fieldIn(set, "title", lang)}
                    </p>
                    <p className="mt-auto text-2xs text-fg-muted">
                      {[
                        set.questions.length > 0
                          ? `${set.questions.length} question${set.questions.length === 1 ? "" : "s"}`
                          : null,
                        missed > 0 ? `${missed} missed` : null,
                        set.readAt ? "read" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  </InteractiveCard>
                </li>
              );
            })}
          </ul>
          {latest.articles.length > 4 && (
            <p className="text-2xs text-fg-muted">
              …and {latest.articles.length - 4} more — open your journal for the whole day.
            </p>
          )}
        </>
      ) : (
        <p className="text-xs text-fg-muted">
          {journal.isPending
            ? "Opening your journal…"
            : "Every question you study and article you read is kept here, day by day."}
        </p>
      )}
    </section>
  );
}
