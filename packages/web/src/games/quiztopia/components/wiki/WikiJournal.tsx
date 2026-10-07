import { parseSetId } from "@boardgames/core/games/quiztopia/ids";
import type {
  JournalDay,
  JournalQuestion,
  JournalSet,
  QuiztopiaLanguage,
} from "@boardgames/core/protocol";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckIcon } from "../../../../components/icons";
import {
  Badge,
  Button,
  Chip,
  EmptyState,
  ErrorAlert,
  LoadingState,
  PageHeader,
  PageMain,
  SearchInput,
  SegmentedControl,
  Surface,
  TONE_TEXT,
} from "../../../../components/ui";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { cn } from "../../../../lib/cn";
import { errorMessageOf } from "../../../../lib/error-message";
import { todayKey } from "../../api";
import { DISTRICTS, type District, districtByN } from "../../bands";
import { articleSnippet, findArticle } from "../../content";
import { useCardArticles } from "../../hooks/useContent";
import { useJournal } from "../../hooks/useJournal";
import { articleLanguage, useQuestionLanguage } from "../../hooks/useQuestionLanguage";
import { pickTexts } from "../../logic/copy";
import {
  filterDay,
  isFiltering,
  type JournalFilter,
  type JournalMode,
  studyIds,
} from "../../logic/journal-filter";
import { dayLabel } from "../../logic/time";
import { type TrainerPaths, useTrainerPaths } from "../../paths";
import { AnswerMark } from "../common/AnswerMark";
import { BuildingGlyph } from "../common/BuildingGlyph";
import { TextLink } from "../common/TextLink";
import { ReportButton } from "../report/ReportButton";
import { TrainerScreen } from "../trainer/TrainerScreen";

// The journal: every day you studied or read, newest first. Each day lists
// the articles it touched, and under each article the questions you were
// asked, with how you did (✓ / ✗ per grade, in order). Answers stay hidden
// until clicked — scrolling back is a chance to quiz yourself — and a
// revealed answer brings the article sentence that gives it away and a link
// to that passage. Filters (text, missed / new / read, districts) apply to
// the days loaded; older days load on demand.

const MODES: { value: JournalMode; label: string; title: string }[] = [
  { value: "all", label: "All", title: "Everything you studied and read" },
  { value: "missed", label: "Missed", title: "Questions you got wrong at least once that day" },
  { value: "new", label: "New", title: "Questions you saw for the first time" },
  { value: "read", label: "Read", title: "Articles you read" },
];

export default function WikiJournal() {
  useDocumentTitle("Your journal · Quiztopia");
  const navigate = useNavigate();
  const paths = useTrainerPaths();
  const { language } = useQuestionLanguage();
  const journal = useJournal();
  const today = useMemo(() => todayKey(), []);
  const [text, setText] = useState("");
  const [mode, setMode] = useState<JournalMode>("all");
  const [districts, setDistricts] = useState<ReadonlySet<number>>(() => new Set());
  const [showAll, setShowAll] = useState(false);

  const filter: JournalFilter = useMemo(() => ({ text, mode, districts }), [text, mode, districts]);
  const shown = useMemo(
    () =>
      journal.days.flatMap((d) => {
        const kept = filterDay(d, filter);
        return kept ? [kept] : [];
      }),
    [journal.days, filter],
  );

  const toggleDistrict = (n: number) =>
    setDistricts((cur) => {
      const next = new Set(cur);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  const loadError = errorMessageOf(journal.error, "Couldn't load your journal.");
  const empty = !journal.isPending && !journal.error && journal.days.length === 0;

  return (
    <TrainerScreen>
      <PageMain width="3xl" className="flex flex-col gap-5 pb-16">
        <PageHeader
          size="lg"
          eyebrow="The Archive"
          title="Your journal"
          subtitle="Everything you studied and read, day by day. Answers stay hidden until you ask."
          actions={
            <Button variant="link" onClick={() => navigate(paths.wiki)}>
              ← Archive
            </Button>
          }
        />

        {!empty && (
          <section aria-label="Filter the journal" className="flex flex-col gap-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <SearchInput
                containerClassName="flex-1"
                aria-label="Search your journal"
                placeholder="Search questions, answers and articles you've seen"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <SegmentedControl
                options={MODES}
                value={mode}
                onChange={setMode}
                size="sm"
                shape="pill"
                selectionMode="toggle"
                aria-label="Show"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {DISTRICTS.map((d) => (
                <Chip
                  key={d.slug}
                  pressed={districts.has(d.n)}
                  tone={d.tone}
                  size="xs"
                  shape="pill"
                  icon={<BuildingGlyph name={d.building} lit={districts.has(d.n)} size={12} />}
                  onClick={() => toggleDistrict(d.n)}
                  aria-label={`Only ${d.en}`}
                  title={`${d.label} · ${d.en}`}
                >
                  {d.label}
                </Chip>
              ))}
              <span className="ml-auto flex items-center gap-2">
                {isFiltering(filter) && (
                  <Button
                    variant="link"
                    size="xs"
                    onClick={() => {
                      setText("");
                      setMode("all");
                      setDistricts(new Set());
                    }}
                  >
                    Clear filters
                  </Button>
                )}
                <Chip
                  pressed={showAll}
                  tone="accent"
                  size="xs"
                  shape="pill"
                  onClick={() => setShowAll((v) => !v)}
                  title="Reveal every answer at once"
                >
                  Show all answers
                </Chip>
              </span>
            </div>
          </section>
        )}

        {loadError && <ErrorAlert message={loadError} />}
        {journal.isPending && <LoadingState label="Opening your journal…" />}

        {empty && (
          <EmptyState
            titleAs="h2"
            title="Your journal is empty"
            description="Study a session or read an article and it shows up here, day by day — ready to look back at."
            action={
              <Button variant="primary" onClick={() => navigate(paths.hub)}>
                Back to the city
              </Button>
            }
          />
        )}

        {!empty && !journal.isPending && shown.length === 0 && (
          <p className="rounded-card-md border border-line-soft p-6 text-center text-sm text-fg-muted">
            Nothing in the loaded days matches.
            {journal.hasNextPage ? " Load older days to search further back." : ""}
          </p>
        )}

        <ol className="flex flex-col gap-6">
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
            <Button
              variant="secondary"
              onClick={() => void journal.fetchNextPage()}
              loading={journal.isFetchingNextPage}
            >
              Load older days
            </Button>
          </div>
        ) : (
          journal.days.length > 0 && (
            <p className="text-center text-2xs text-fg-disabled">
              That's where your journal begins.
            </p>
          )
        )}
      </PageMain>
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
  language: QuiztopiaLanguage;
  revealAll: boolean;
}) {
  const navigate = useNavigate();
  const all = studyIds(day);
  const missed = studyIds(day, true);
  const headingId = `journal-${day.date}`;
  return (
    <li aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="sticky top-0 z-lift -mx-1 flex flex-col gap-2 bg-surface-950/90 px-1 py-2 backdrop-blur sm:flex-row sm:items-center sm:gap-3">
        <div className="min-w-0 flex-1">
          <h2 id={headingId} className="text-base font-semibold text-fg-strong">
            {dayLabel(day.date, today)}
          </h2>
          <p className="text-2xs tabular-nums text-fg-muted">{dayFacts(day)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {missed.length > 0 && (
            <Button
              variant="tinted"
              tone="rose"
              size="xs"
              onClick={() => navigate(paths.study({ ids: missed }))}
            >
              Study {missed.length} missed
            </Button>
          )}
          {all.length > 0 && (
            <Button
              variant="secondary"
              size="xs"
              onClick={() => navigate(paths.study({ ids: all }))}
            >
              {all.length === 1 ? "Study it again" : `Study these ${all.length} again`}
            </Button>
          )}
        </div>
      </div>
      <ul className="flex flex-col gap-3">
        {day.sets.map((set) => (
          <JournalSetCard
            key={set.setId}
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

function JournalSetCard({
  set,
  paths,
  language,
  revealAll,
}: {
  set: JournalSet;
  paths: TrainerPaths;
  language: QuiztopiaLanguage;
  revealAll: boolean;
}) {
  const d = districtByN(set.category);
  const cardId = parseSetId(set.setId)?.cardId ?? "";
  const titles = pickTexts(language, set.titleEn, set.titleDe);
  return (
    <Surface as="li" variant="tile" padding="none" className="overflow-hidden">
      <div className="flex flex-col gap-1.5 border-b border-line-soft px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            tone={d.tone}
            size="xs"
            icon={<BuildingGlyph name={d.building} lit size={11} />}
            title={`${d.label} · ${d.en}`}
          >
            {d.label} · {language === "de" ? d.de : d.en}
          </Badge>
          <span className="ml-auto flex items-center gap-2">
            {set.readAt && (
              <Badge tone="emerald" size="xs" icon={<CheckIcon className="h-3 w-3" />}>
                Read {readTime(set.readAt)}
              </Badge>
            )}
            <ReportButton
              context={{
                target: { kind: "article", id: set.setId },
                title: titles[0] ?? set.titleEn,
                category: set.category,
                surface: "journal",
                language,
              }}
            />
          </span>
        </div>
        <div className="min-w-0">
          <Link
            to={paths.wikiArticle(d.slug, cardId)}
            className="text-sm font-semibold text-fg-strong hover:underline"
          >
            {titles[0]}
          </Link>
          {titles[1] && <p className="text-2xs text-fg-muted">{titles[1]}</p>}
        </div>
      </div>
      {set.questions.length > 0 ? (
        <ol className="divide-y divide-line-soft">
          {set.questions.map((q) => (
            <JournalQuestionRow
              key={q.questionId}
              question={q}
              district={d}
              cardId={cardId}
              setId={set.setId}
              paths={paths}
              language={language}
              revealAll={revealAll}
            />
          ))}
        </ol>
      ) : (
        <p className="px-4 py-3 text-xs text-fg-muted">
          Read only — no questions from this article that day.{" "}
          <TextLink to={paths.wikiArticle(d.slug, cardId)}>Read it again →</TextLink>
        </p>
      )}
    </Surface>
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
            "inline-flex h-4 w-4 items-center justify-center rounded-full text-3xs font-bold",
            g === "good" ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300",
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
  district: d,
  cardId,
  setId,
  paths,
  language,
  revealAll,
}: {
  question: JournalQuestion;
  district: District;
  cardId: string;
  setId: string;
  paths: TrainerPaths;
  language: QuiztopiaLanguage;
  revealAll: boolean;
}) {
  const [opened, setOpened] = useState(false);
  const revealed = opened || revealAll;
  const questions = pickTexts(language, q.en, q.de);
  const answers = pickTexts(language, q.answerEn, q.answerDe);
  return (
    <li className="flex gap-3 px-4 py-3">
      <GradeMarks grades={q.grades} />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-start gap-x-2 gap-y-1">
          <p className="min-w-0 flex-1 text-sm text-fg-primary">
            {questions[0]}
            {questions[1] && (
              <span className="mt-0.5 block text-xs text-fg-muted">{questions[1]}</span>
            )}
          </p>
          {q.firstSeen && (
            <Badge tone="sky" size="xs">
              New
            </Badge>
          )}
          {q.fromGame && (
            <Badge tone="purple" size="xs">
              Table game
            </Badge>
          )}
          <ReportButton
            context={{
              target: { kind: "question", id: q.questionId },
              title: questions[0] ?? q.en,
              category: d.n,
              surface: "journal",
              hideSpoilers: !revealed,
              language,
            }}
          />
        </div>
        {revealed ? (
          <div className="flex flex-col gap-1">
            <p className={cn("text-base font-semibold", TONE_TEXT[d.tone])}>
              {answers[0]}
              {answers[1] && (
                <span className="ml-2 text-sm font-normal text-fg-secondary">{answers[1]}</span>
              )}
            </p>
            <AnswerPassage cardId={cardId} setId={setId} q={q.q} district={d} language={language} />
            <TextLink to={paths.wikiArticle(d.slug, cardId, q.q)} className="self-start">
              Passage in the article →
            </TextLink>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            className="self-start"
            onClick={() => setOpened(true)}
            aria-label={`Show the answer to: ${questions[0]}`}
          >
            Show answer
          </Button>
        )}
      </div>
    </li>
  );
}

/** The article sentence around the answer — loaded only once an answer is revealed. */
function AnswerPassage({
  cardId,
  setId,
  q,
  district: d,
  language,
}: {
  cardId: string;
  setId: string;
  q: number;
  district: District;
  language: QuiztopiaLanguage;
}) {
  const articles = useCardArticles(cardId);
  const lang = articleLanguage(language);
  const snippet = useMemo(() => {
    const article = articles.data ? findArticle(articles.data, setId) : null;
    const span = article?.answerSpans[lang][q];
    if (!article || !span) return null;
    return articleSnippet(lang === "de" ? article.articleDe : article.articleEn, span);
  }, [articles.data, setId, lang, q]);
  if (!snippet) return null;
  return (
    <p className="text-xs leading-relaxed text-fg-secondary" lang={lang}>
      {snippet.before}
      <AnswerMark tone={d.tone}>{snippet.match}</AnswerMark>
      {snippet.after}
    </p>
  );
}
