import type {
  JournalArticle,
  JournalDay,
  JournalQuestion,
  QuizLanguages,
} from "@boardgames/core/protocol";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ErrorAlert, LoadingState } from "../../../../components/ui";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { cn } from "../../../../lib/cn";
import { errorMessageOf } from "../../../../lib/error-message";
import { todayKey } from "../../api";
import { articleSnippet, bodyIn, findFact } from "../../content";
import { DOMAINS, type Domain, domainOf } from "../../domains";
import { useArticle } from "../../hooks/useContent";
import { useJournal } from "../../hooks/useJournal";
import { useQuestionLanguage } from "../../hooks/useQuestionLanguage";
import {
  filterDay,
  isFiltering,
  type JournalFilter,
  type JournalMode,
  studyIds,
} from "../../logic/journal-filter";
import { inLangs, reportLanguageOf } from "../../logic/text";
import { dayLabel } from "../../logic/time";
import { type TrainerPaths, useTrainerPaths } from "../../paths";
import { AnswerMark } from "../common/AnswerMark";
import {
  Headline,
  JumpLine,
  Kicker,
  PaperButton,
  PaperNote,
  PaperSearch,
  PaperTabs,
  PrintButton,
  SectionToggles,
  Stamp,
} from "../paper/Paper";
import { PaperPage } from "../paper/PaperPage";
import { editionNumber, KICKER, longDate, RULE_DOUBLE_TOP } from "../paper/paper-style";
import { ReportButton } from "../report/ReportButton";
import { TrainerScreen } from "../trainer/TrainerScreen";

// Back issues (the journal): every day you studied or read, newest first,
// each day set as an issue with its articles as clippings. Each day lists
// the articles it touched, and under each article the questions you were
// asked, with how you did (✓ / ✗ per grade, in order). Answers stay hidden
// until clicked — scrolling back is a chance to quiz yourself — and a
// revealed answer brings the article sentence that gives it away and a link
// to that passage. Filters (text, missed / new / read, domains) apply to
// the days loaded; older days load on demand.

const MODES: { value: JournalMode; label: string; title: string }[] = [
  { value: "all", label: "All", title: "Everything you studied and read" },
  { value: "missed", label: "Missed", title: "Questions you got wrong at least once that day" },
  { value: "new", label: "New", title: "Questions you saw for the first time" },
  { value: "read", label: "Read", title: "Articles you read" },
];

export default function WikiJournal() {
  useDocumentTitle("Your journal · Quiz");
  const navigate = useNavigate();
  const paths = useTrainerPaths();
  const { language } = useQuestionLanguage();
  const journal = useJournal();
  const today = useMemo(() => todayKey(), []);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<JournalMode>("all");
  const [domains, setDomains] = useState<ReadonlySet<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);

  const filter: JournalFilter = useMemo(() => ({ text, mode, domains }), [text, mode, domains]);
  const shown = useMemo(
    () =>
      journal.days.flatMap((d) => {
        const kept = filterDay(d, filter);
        return kept ? [kept] : [];
      }),
    [journal.days, filter],
  );

  const toggleDomain = (n: string) =>
    setDomains((cur) => {
      const next = new Set(cur);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  const loadError = errorMessageOf(journal.error, "Couldn't load your journal.");
  const empty = !journal.isPending && !journal.error && journal.days.length === 0;

  return (
    <TrainerScreen>
      <PaperPage pageLabel="Back issues" folio="C1" current="journal" className="gap-4">
        <header className="flex flex-col gap-1">
          <Headline as="h1" size="lg">
            Back issues
          </Headline>
          <p className="font-news text-sm italic text-fg-secondary">
            Everything you studied and read, issue by issue. Answers stay hidden until you ask.
          </p>
        </header>

        {!empty && (
          <section
            aria-label="Filter the back issues"
            className="flex flex-col gap-3 border-y border-line-strong py-3"
          >
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <PaperSearch
                className="md:w-96"
                label="Search your journal"
                placeholder="Questions, answers and articles you've seen"
                value={text}
                onChange={setText}
              />
              <PaperTabs<JournalMode>
                label="Show"
                options={MODES}
                value={mode}
                onChange={setMode}
              />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <SectionToggles domains={DOMAINS} selected={domains} onToggle={toggleDomain} />
              <span className="ml-auto flex items-center gap-4">
                {isFiltering(filter) && (
                  <PrintButton
                    className="text-fg-muted"
                    onClick={() => {
                      setText("");
                      setMode("all");
                      setDomains(new Set());
                    }}
                  >
                    Clear filters
                  </PrintButton>
                )}
                <PrintButton
                  aria-pressed={showAll}
                  onClick={() => setShowAll((v) => !v)}
                  title="Reveal every answer at once"
                >
                  Show all answers
                </PrintButton>
              </span>
            </div>
          </section>
        )}

        {loadError && <ErrorAlert message={loadError} />}
        {journal.isPending && <LoadingState label="Fetching the back issues…" />}

        {empty && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Headline as="h2" size="md">
              No back issues yet
            </Headline>
            <p className="max-w-md font-news text-sm italic text-fg-secondary">
              Study a session or read an article and it is filed here, day by day — ready to look
              back at.
            </p>
            <PaperButton primary onClick={() => navigate(paths.hub)}>
              To the front page
            </PaperButton>
          </div>
        )}

        {!empty && !journal.isPending && shown.length === 0 && (
          <PaperNote>
            Nothing in the loaded days matches.
            {journal.hasNextPage ? " Fetch earlier issues to search further back." : ""}
          </PaperNote>
        )}

        <ol className="flex flex-col gap-8">
          {shown.map((day) => (
            <JournalDayBlock
              key={day.date}
              day={day}
              today={today}
              paths={paths}
              language={language}
              revealAll={showAll}
            />
          ))}
        </ol>

        {journal.hasNextPage ? (
          <div className="flex justify-center">
            <PaperButton
              onClick={() => void journal.fetchNextPage()}
              loading={journal.isFetchingNextPage}
            >
              Earlier issues
            </PaperButton>
          </div>
        ) : (
          journal.days.length > 0 && (
            <PaperNote className="py-2">First issue — that's where your journal begins.</PaperNote>
          )
        )}
      </PaperPage>
    </TrainerScreen>
  );
}

// ── Day ──────────────────────────────────────────────────────────────────

function dayFacts(day: JournalDay): string {
  const parts: string[] = [];
  if (day.reviewed > 0) {
    parts.push(`${day.reviewed} ${day.reviewed === 1 ? "answer" : "answers"}`);
    if (day.newQuestions > 0) parts.push(`${day.newQuestions} new`);
    parts.push(`${Math.round((day.knew / day.reviewed) * 100)}% knew it`);
  }
  if (day.articlesRead > 0) {
    parts.push(`${day.articlesRead} ${day.articlesRead === 1 ? "article" : "articles"} read`);
  }
  return parts.join(" · ");
}

function JournalDayBlock({
  day,
  today,
  paths,
  language,
  revealAll,
}: {
  day: JournalDay;
  /** The viewer's local date key, for "Today" / "Yesterday". */
  today: string;
  paths: TrainerPaths;
  language: QuizLanguages;
  revealAll: boolean;
}) {
  const navigate = useNavigate();
  const all = studyIds(day);
  const missed = studyIds(day, true);
  const headingId = `journal-${day.date}`;
  return (
    <li aria-labelledby={headingId} className="flex flex-col gap-3">
      <div
        className={cn(
          RULE_DOUBLE_TOP,
          "sticky top-0 z-lift flex flex-col gap-2 border-b border-b-fg-primary bg-surface-900/95 py-2 backdrop-blur sm:flex-row sm:items-center sm:gap-4",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <h2 id={headingId} className="font-headline text-xl font-bold text-fg-strong">
            {dayLabel(day.date, today)}
          </h2>
          <span className={cn(KICKER, "text-accent-300")}>
            No. {editionNumber(day.date)} · {longDate(day.date)}
          </span>
          <span className={cn(KICKER, "tabular-nums text-fg-muted")}>{dayFacts(day)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {missed.length > 0 && (
            <PaperButton size="xs" onClick={() => navigate(paths.study({ ids: missed }))}>
              Study {missed.length} missed
            </PaperButton>
          )}
          {all.length > 0 && (
            <PaperButton size="xs" onClick={() => navigate(paths.study({ ids: all }))}>
              {all.length === 1 ? "Study it again" : `Study these ${all.length} again`}
            </PaperButton>
          )}
        </div>
      </div>
      <ul className="gap-x-7 md:cols-news-2 2xl:cols-news-3">
        {day.articles.map((set) => (
          <JournalArticleCard
            key={set.articleId}
            set={set}
            paths={paths}
            language={language}
            revealAll={revealAll}
          />
        ))}
      </ul>
    </li>
  );
}

// ── Article ──────────────────────────────────────────────────────────────

function readTime(iso: string): string {
  const t = new Date(iso);
  return Number.isNaN(t.getTime())
    ? ""
    : t.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function JournalArticleCard({
  set,
  paths,
  language,
  revealAll,
}: {
  set: JournalArticle;
  paths: TrainerPaths;
  language: QuizLanguages;
  revealAll: boolean;
}) {
  const d = domainOf(set.domain);
  const titles = inLangs(language, { en: set.titleEn, de: set.titleDe, ru: set.titleRu });
  return (
    <li className="mb-5 break-inside-avoid border-b border-line-strong pb-3">
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Kicker domain={set.domain} icon={28} className="min-w-0 flex-1" />
          {set.readAt && <Stamp tone="emerald">✓ Read {readTime(set.readAt)}</Stamp>}
          <ReportButton
            context={{
              target: { kind: "article", id: set.articleId },
              title: titles[0] ?? set.titleEn,
              domain: set.domain,
              surface: "journal",
              language: reportLanguageOf(language),
            }}
          />
        </div>
        <Link
          to={paths.wikiArticle(set.articleId)}
          className="font-headline text-lg font-bold leading-snug text-fg-strong hover:text-accent-200"
        >
          {titles[0]}
        </Link>
        {titles[1] && <p className="font-news text-xs italic text-fg-muted">{titles[1]}</p>}
      </div>
      {set.questions.length > 0 ? (
        <ol className="mt-1 flex flex-col">
          {set.questions.map((q) => (
            <JournalQuestionRow
              key={q.questionId}
              question={q}
              domain={d}
              articleId={set.articleId}
              paths={paths}
              language={language}
              revealAll={revealAll}
            />
          ))}
        </ol>
      ) : (
        <p className="mt-1 font-news text-sm italic text-fg-muted">
          Read only — no questions from this article that day.{" "}
          <Link
            to={paths.wikiArticle(set.articleId)}
            className="not-italic text-accent-300 hover:underline"
          >
            Read it again
          </Link>
        </p>
      )}
    </li>
  );
}

// ── Question ─────────────────────────────────────────────────────────────

function GradeMarks({ grades }: { grades: JournalQuestion["grades"] }) {
  const label = grades.map((g) => (g === "good" ? "knew it" : "missed")).join(", then ");
  return (
    // Fixed width so every question's text starts on the same line,
    // whether it got one grade that day or three.
    <span
      className="flex w-9 shrink-0 flex-wrap items-center gap-0.5 self-start pt-0.5"
      title={label}
    >
      <span className="sr-only">{label}</span>
      {grades.map((g, i) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: grades are an ordered log; position is the identity
          key={i}
          aria-hidden="true"
          className={cn(
            "inline-flex h-4 w-4 items-center justify-center border font-news text-3xs font-bold",
            g === "good"
              ? "border-emerald-300/60 text-emerald-300"
              : "border-rose-300/60 text-rose-300",
          )}
        >
          {g === "good" ? "✓" : "✗"}
        </span>
      ))}
    </span>
  );
}

function JournalQuestionRow({
  question: q,
  domain: d,
  articleId,
  paths,
  language,
  revealAll,
}: {
  question: JournalQuestion;
  domain: Domain;
  articleId: string;
  paths: TrainerPaths;
  language: QuizLanguages;
  revealAll: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const revealed = opened || revealAll;
  const questions = inLangs(language, q);
  const answers = inLangs(language, { en: q.answerEn, de: q.answerDe, ru: q.answerRu });
  return (
    <li className="flex gap-3 border-t border-dotted border-line-strong py-2.5">
      <GradeMarks grades={q.grades} />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          <p className="min-w-0 flex-1 font-news text-sm text-fg-primary">
            {questions[0]}
            {questions[1] && (
              <span className="mt-0.5 block text-xs italic text-fg-muted">{questions[1]}</span>
            )}
          </p>
          {q.firstSeen && <Stamp tone="sky">New</Stamp>}
          {q.fromGame && <Stamp>Table game</Stamp>}
          <ReportButton
            context={{
              target: { kind: "question", id: q.questionId },
              title: questions[0] ?? q.en,
              domain: d.slug,
              surface: "journal",
              hideSpoilers: !revealed,
              language: reportLanguageOf(language),
            }}
          />
        </div>
        {revealed ? (
          <div className="flex flex-col gap-1">
            <p className={cn("font-headline text-lg font-bold", d.ink)}>
              {answers[0]}
              {answers[1] && (
                <span className="ml-2 font-news text-sm font-normal text-fg-secondary">
                  {answers[1]}
                </span>
              )}
            </p>
            <AnswerPassage
              articleId={articleId}
              factId={q.questionId}
              domain={d}
              language={language}
            />
            <JumpLine to={paths.wikiArticle(articleId, q.questionId)}>
              Passage in the article
            </JumpLine>
          </div>
        ) : (
          <PrintButton
            className="self-start"
            onClick={() => setOpened(true)}
            aria-label={`Show the answer to: ${questions[0]}`}
          >
            Show answer
          </PrintButton>
        )}
      </div>
    </li>
  );
}

/** The article sentence around the answer — loaded only once an answer is revealed. */
function AnswerPassage({
  articleId,
  factId,
  domain: d,
  language,
}: {
  articleId: string;
  factId: string;
  domain: Domain;
  language: QuizLanguages;
}) {
  const article = useArticle(articleId);
  const lang = language.primary;
  const snippet = useMemo(() => {
    const found = article.data ? findFact(article.data, factId) : null;
    if (!article.data || !found) return null;
    const { body, spans } = bodyIn(article.data, lang);
    const span = spans[found.index];
    return span ? articleSnippet(body, span) : null;
  }, [article.data, factId, lang]);
  if (!snippet) return null;
  return (
    <p
      className="border-l border-fg-primary/50 pl-3 font-news text-sm italic leading-relaxed text-fg-secondary"
      lang={lang}
    >
      {snippet.before}
      <AnswerMark tone={d.tone} variant="print" domain={d.slug}>
        {snippet.match}
      </AnswerMark>
      {snippet.after}
    </p>
  );
}
