import type {
  QuizLanguages,
  RecentMisses,
  TrainerHistory,
  TrainerOverview,
} from "@boardgames/core/protocol";
import { daysBetween } from "@boardgames/core/quiz/srs";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { QueryBoundary } from "../../../../components/ui";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { cn } from "../../../../lib/cn";
import { qk } from "../../../../lib/query-keys";
import { historyQuery, overviewQuery, recentMissesQuery, todayKey } from "../../api";
import { findFact } from "../../content";
import { DOMAINS, domainOf } from "../../domains";
import { useArticle } from "../../hooks/useContent";
import { useQuizSettings } from "../../hooks/useQuizSettings";
import { questionOf } from "../../hooks/useTrainerSession";
import { inLangs } from "../../logic/text";
import { relativeDays } from "../../logic/time";
import { type TrainerPaths, useTrainerPaths } from "../../paths";
import { DomainIcon } from "../common/DomainIcon";
import { InkMeter, JumpLine, Kicker, PaperButton, SectionHead } from "../paper/Paper";
import { PaperPage } from "../paper/PaperPage";
import { KICKER } from "../paper/paper-style";
import { buildHeatmap, formatHeatDate, type HeatLevel } from "./heatmap";
import { TrainerScreen } from "./TrainerScreen";

// The Record: the trainer's statistics as a newspaper's numbers page. The
// figures across the top (streak, the week, what's due, learnt, retention),
// then the sections' standings as a sports table, the study days as an ink
// calendar with the last month's reviews under it, and the corrections —
// what the table got wrong in recent games, ready to practise.

const HISTORY_DAYS = 182;
const HEATMAP_WEEKS = 26;
const BAR_DAYS = 30;

export default function RecordPage() {
  useDocumentTitle("Quiz · The Record");
  const today = useMemo(() => todayKey(), []);
  const overview = useQuery({
    queryKey: qk.quizOverview(today),
    queryFn: overviewQuery(today),
    staleTime: 30_000,
  });
  return (
    <TrainerScreen>
      <QueryBoundary query={overview} loadingLabel="Setting the numbers…">
        {(data) => <RecordBody overview={data} today={today} />}
      </QueryBoundary>
    </TrainerScreen>
  );
}

function RecordBody({ overview, today }: { overview: TrainerOverview; today: string }) {
  const paths = useTrainerPaths();
  const { settings } = useQuizSettings();
  const history = useQuery({
    queryKey: qk.quizHistory(HISTORY_DAYS, today),
    queryFn: historyQuery(today, HISTORY_DAYS),
    staleTime: 60_000,
  });
  const misses = useQuery({
    queryKey: qk.quizRecentMisses(),
    queryFn: recentMissesQuery(),
    staleTime: 60_000,
  });
  const days = history.data?.days ?? [];

  return (
    <PaperPage
      pageLabel="The Record"
      folio="A6"
      current="record"
      fill
      className="gap-5 py-4"
      folioRight={<span className="tabular-nums">content {overview.contentVersion}</span>}
    >
      <Figures overview={overview} days={days} today={today} />

      <div className="grid gap-8 lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <section aria-label="The standings" className="flex min-h-0 min-w-0 flex-col gap-3">
          <SectionHead right="% = learnt of every fact">The standings</SectionHead>
          <Standings overview={overview} paths={paths} />
        </section>

        <div className="flex min-h-0 min-w-0 flex-col gap-6">
          <section aria-label="Study days" className="flex min-h-0 flex-1 flex-col gap-3">
            <SectionHead right={`last ${HEATMAP_WEEKS} weeks`}>Study days</SectionHead>
            <InkCalendar days={days} today={today} />
            <ReviewBars days={days} today={today} />
          </section>
          <section aria-label="Corrections" className="flex flex-col gap-3">
            <Corrections
              misses={misses.data?.misses ?? []}
              language={settings.language}
              paths={paths}
            />
          </section>
        </div>
      </div>
    </PaperPage>
  );
}

// ── By the numbers ──────────────────────────────────────────────────────────

function Figures({
  overview,
  days,
  today,
}: {
  overview: TrainerOverview;
  days: TrainerHistory["days"];
  today: string;
}) {
  const cats = overview.domains;
  const due = cats.reduce((n, c) => n + c.due, 0);
  const known = cats.reduce((n, c) => n + c.known, 0);
  const total = cats.reduce((n, c) => n + c.total, 0);
  let num = 0;
  let den = 0;
  for (const c of cats) {
    if (c.retention30 === null || c.reviews30 === 0) continue;
    num += c.retention30 * c.reviews30;
    den += c.reviews30;
  }
  const week = days
    .filter((d) => daysBetween(d.date, today) < 7)
    .reduce((n, d) => n + d.reviews, 0);
  const figures: { label: string; value: string; note: string }[] = [
    {
      label: "Streak",
      value: String(overview.streak.current),
      note: overview.streak.studiedToday
        ? "days, today included"
        : overview.streak.current > 0
          ? "days — study today to keep it"
          : "start one today",
    },
    { label: "Best streak", value: String(overview.streak.longest), note: "days in a row" },
    { label: "This week", value: String(week), note: "cards studied" },
    { label: "Due today", value: String(due), note: "in the Revision Corner" },
    {
      label: "Learnt",
      value: known.toLocaleString("en"),
      note: `of ${total.toLocaleString("en")} facts`,
    },
    {
      label: "Retention",
      value: den > 0 ? `${Math.round((num / den) * 100)}%` : "—",
      note: den > 0 ? "known on review, 30 days" : "after your first reviews",
    },
  ];
  return (
    <section aria-label="By the numbers" className="flex flex-col gap-3">
      <SectionHead>By the numbers</SectionHead>
      <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6">
        {figures.map((f) => (
          <div
            key={f.label}
            className="flex flex-col gap-1 border-line-strong px-4 py-2 first:pl-0 xl:border-l xl:first:border-l-0"
          >
            <dt className={cn(KICKER, "text-fg-muted")}>{f.label}</dt>
            <dd className="font-headline text-3xl leading-none font-black tabular-nums text-fg-strong roomy:text-5xl">
              {f.value}
            </dd>
            <dd className="font-news text-xs italic text-fg-muted">{f.note}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ── The standings ───────────────────────────────────────────────────────────

/** Section · Seen · Learnt · Due · Leeches · Kept · % · Study, on one track. */
const STANDINGS_COLS =
  "grid grid-cols-[minmax(0,1fr)_repeat(3,3rem)_3.5rem_3rem_3rem_4rem] items-center gap-x-2 sm:grid-cols-[minmax(0,1fr)_repeat(6,3.75rem)_4.5rem]";

function Standings({ overview, paths }: { overview: TrainerOverview; paths: TrainerPaths }) {
  const byDomain = new Map(overview.domains.map((d) => [d.domain, d]));
  const th = cn(KICKER, "text-right text-fg-muted");
  const rows = DOMAINS.flatMap((d) => {
    const c = byDomain.get(d.slug);
    return c ? [{ d, c }] : [];
  });
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-x-auto">
      <div className="min-w-xl flex min-h-0 flex-1 flex-col font-news text-sm tabular-nums">
        <div className={cn(STANDINGS_COLS, "border-b border-fg-primary pb-1.5")}>
          <span className={cn(th, "text-left")}>Section</span>
          <span className={th}>Seen</span>
          <span className={th}>Learnt</span>
          <span className={th}>Due</span>
          <span className={th} title="Missed eight times or more">
            Leeches
          </span>
          <span className={th}>Kept</span>
          <span className={th}>%</span>
          <span className="sr-only">Study</span>
        </div>
        <ol className="flex min-h-0 flex-1 flex-col">
          {rows.map(({ d, c }) => {
            const pct = c.total > 0 ? Math.round((c.known / c.total) * 100) : 0;
            return (
              <li
                key={d.slug}
                className={cn(
                  STANDINGS_COLS,
                  "min-h-9 flex-1 border-b border-dotted border-line-strong lg:min-h-0",
                )}
              >
                <Link
                  to={paths.wikiDomain(d.slug)}
                  className="group flex h-full min-w-0 items-center gap-3 py-0.5 text-fg-primary hover:text-fg-strong"
                >
                  <span className="relative aspect-square h-full max-h-11 shrink-0">
                    <DomainIcon domain={d.slug} size={56} className="absolute inset-0 size-full" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                    <span className="truncate font-headline text-sm font-bold leading-tight group-hover:text-accent-200 roomy:text-base">
                      {d.en}
                    </span>
                    <InkMeter
                      value={c.total > 0 ? c.known / c.total : 0}
                      domain={d.slug}
                      className="hidden roomy:block"
                    />
                  </span>
                </Link>
                <span className="text-right text-fg-secondary">{c.seen}</span>
                <span className="text-right text-fg-primary">{c.known}</span>
                <span className={cn("text-right", c.due > 0 ? "text-sky-300" : "text-fg-muted")}>
                  {c.due}
                </span>
                <span
                  className={cn("text-right", c.leeches > 0 ? "text-rose-300" : "text-fg-muted")}
                >
                  {c.leeches}
                </span>
                <span className="text-right text-fg-secondary">
                  {c.retention30 === null ? "—" : `${Math.round(c.retention30 * 100)}%`}
                </span>
                <span className="text-right font-semibold text-fg-strong">{pct}%</span>
                <span className="text-right">
                  <JumpLine to={paths.study({ domain: d.slug })}>Study</JumpLine>
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}

// ── Study days ──────────────────────────────────────────────────────────────

const INK: Record<HeatLevel, string> = {
  0: "bg-fill",
  1: "bg-accent-400/25",
  2: "bg-accent-400/50",
  3: "bg-accent-400/75",
  4: "bg-accent-400",
};

const WEEKDAYS = [
  ["mon", "Mon"],
  ["tue", ""],
  ["wed", "Wed"],
  ["thu", ""],
  ["fri", "Fri"],
  ["sat", ""],
  ["sun", "Sun"],
] as const;

/** The study days as an ink calendar: one square a day, darker for more cards. */
function InkCalendar({ days, today }: { days: TrainerHistory["days"]; today: string }) {
  const columns = buildHeatmap(days, today, HEATMAP_WEEKS);
  const studied = days.filter(
    (d) => d.reviews > 0 && daysBetween(d.date, today) < HEATMAP_WEEKS * 7,
  );
  return (
    <figure className="flex flex-col gap-2">
      <div className="grid grid-flow-col grid-cols-[auto_repeat(26,minmax(0,1fr))] grid-rows-[auto_repeat(7,auto)] gap-0.5">
        <span aria-hidden="true" className="h-4" />
        {WEEKDAYS.map(([id, w]) => (
          <span
            key={id}
            aria-hidden="true"
            className="flex items-center pr-1.5 font-news text-3xs leading-none text-fg-muted"
          >
            {w}
          </span>
        ))}
        {columns.map((col) => [
          <span
            key={`month-${col.monday}`}
            aria-hidden="true"
            className="h-4 overflow-visible font-news text-3xs whitespace-nowrap text-fg-muted"
          >
            {col.monthLabel ?? ""}
          </span>,
          ...col.cells.map((cell) => (
            <span
              key={cell.date}
              title={
                cell.future
                  ? undefined
                  : `${formatHeatDate(cell.date)}: ${cell.count} ${cell.count === 1 ? "card" : "cards"}`
              }
              className={cn("aspect-square", cell.future ? "bg-transparent" : INK[cell.level])}
            />
          )),
        ])}
      </div>
      <figcaption className="font-news text-xs italic text-fg-muted">
        Studied on {studied.length} of the last {HEATMAP_WEEKS * 7} days.
      </figcaption>
    </figure>
  );
}

/** The last month's cards per day as ink bars, today's in the accent. */
function ReviewBars({ days, today }: { days: TrainerHistory["days"]; today: string }) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const series = Array.from({ length: BAR_DAYS }, (_, i) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() - (BAR_DAYS - 1 - i));
    const key = date.toISOString().slice(0, 10);
    const d = byDate.get(key);
    return { date: key, reviews: d?.reviews ?? 0, good: d?.good ?? 0 };
  });
  const max = Math.max(1, ...series.map((s) => s.reviews));
  const total = series.reduce((n, s) => n + s.reviews, 0);
  return (
    <figure className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div
        role="img"
        aria-label={`${total} cards studied in the last ${BAR_DAYS} days`}
        className="flex min-h-12 flex-1 items-end gap-px border-b border-fg-primary"
      >
        {series.map((s) => (
          <span
            key={s.date}
            title={`${formatHeatDate(s.date)}: ${s.reviews} studied, ${s.good} known`}
            className={cn(
              "min-w-0 flex-1",
              s.date === today ? "bg-accent-400" : "bg-fg-primary/60",
              s.reviews === 0 && "bg-transparent",
            )}
            style={{ height: `${(s.reviews / max) * 100}%` }}
          />
        ))}
      </div>
      <figcaption className="flex justify-between font-news text-xs italic text-fg-muted">
        <span>{formatHeatDate(series[0].date)}</span>
        <span>
          {total} cards in {BAR_DAYS} days · busiest {max === 1 && total === 0 ? 0 : max}
        </span>
        <span>today</span>
      </figcaption>
    </figure>
  );
}

// ── Corrections ─────────────────────────────────────────────────────────────

type Miss = RecentMisses["misses"][number];

/** What the table got wrong in recent co-op games: one button practises them all. */
function Corrections({
  misses,
  language,
  paths,
}: {
  misses: readonly Miss[];
  language: QuizLanguages;
  paths: TrainerPaths;
}) {
  const navigate = useNavigate();
  const ids = misses.map((m) => m.questionId);
  const shown = misses.slice(0, 8);
  return (
    <>
      <SectionHead right="from the table, 60 days">Corrections</SectionHead>
      {shown.length === 0 ? (
        <p className="font-news text-sm italic text-fg-muted">
          No corrections to print. Questions the table gets wrong in a co-op game land here, ready
          to practise in one go.
        </p>
      ) : (
        <ol className="flex flex-col">
          {shown.map((m) => (
            <MissRow key={m.questionId} miss={m} language={language} paths={paths} />
          ))}
        </ol>
      )}
      {ids.length > 0 && (
        <div className="flex items-center gap-4">
          <PaperButton size="sm" onClick={() => navigate(paths.study({ ids }))}>
            Practise all {ids.length}
          </PaperButton>
          {misses.length > shown.length && (
            <span className="font-news text-xs italic text-fg-muted">
              {misses.length - shown.length} more not shown
            </span>
          )}
        </div>
      )}
    </>
  );
}

function MissRow({
  miss,
  language,
  paths,
}: {
  miss: Miss;
  language: QuizLanguages;
  paths: TrainerPaths;
}) {
  const { settings } = useQuizSettings();
  const article = useArticle(miss.articleId);
  const found = article.data ? findFact(article.data, miss.questionId) : null;
  const question = found ? questionOf(found.fact, settings.sources) : null;
  const texts = question ? inLangs(language, question) : [];
  return (
    <li className="flex flex-col gap-0.5 border-b border-dotted border-line-strong py-2">
      <Kicker domain={miss.domain} icon={20}>
        {` · ${relativeDays(miss.reviewedAt)}${miss.missCount > 1 ? ` · missed ×${miss.missCount}` : ""}`}
      </Kicker>
      <Link
        to={paths.wikiArticle(miss.articleId, miss.questionId)}
        className="font-news text-sm text-fg-primary hover:text-fg-strong"
      >
        {texts[0] ?? (article.isError ? "Question unavailable" : "…")}
      </Link>
      {texts[1] && <span className="font-news text-xs text-fg-muted">{texts[1]}</span>}
      <span className="sr-only">{domainOf(miss.domain).en}</span>
    </li>
  );
}
