import type { ContentSetQuestions } from "@boardgames/core/games/quiztopia/content-types";
import { QUESTIONS_PER_SET, questionId, setId } from "@boardgames/core/games/quiztopia/ids";
import type { WikiReads } from "@boardgames/core/protocol";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "react-router-dom";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon } from "../../../../components/icons";
import {
  Badge,
  Button,
  Chip,
  ErrorAlert,
  Eyebrow,
  Kbd,
  LoadingState,
  MicroLabel,
  PageHeader,
  PageMain,
  Surface,
  TONE_TEXT,
} from "../../../../components/ui";
import useDocumentTitle from "../../../../hooks/useDocumentTitle";
import { cn } from "../../../../lib/cn";
import { qk } from "../../../../lib/query-keys";
import { postWikiRead, wikiReadsQuery } from "../../api";
import { type District, districtBySlug, TONE_LIT, TONE_STRIP } from "../../bands";
import { CARD_IDS, findArticle } from "../../content";
import { useCardArticles, useCardQuestions } from "../../hooks/useContent";
import { usePinnedIds } from "../../hooks/usePinnedTimeline";
import { useQuestionLanguage } from "../../hooks/useQuestionLanguage";
import { isPlainKey, isTypingTarget } from "../../keys";
import { useTrainerPaths } from "../../paths";
import { BuildingGlyph } from "../common/BuildingGlyph";
import { LanguageToggle } from "../common/LanguageToggle";
import { SourceLink } from "../common/SourceLink";
import { TextLink } from "../common/TextLink";
import { TimelineChip } from "../timeline/TimelineChip";
import { TrainerScreen } from "../trainer/TrainerScreen";
import { ArticleBody } from "./ArticleBody";
import { type ArticleBlock, markedQuestions, segmentArticle } from "./article-segments";
import { EditorNote } from "./EditorNote";
import { QuestionDots } from "./QuestionDots";

// One set's article with its five answers highlighted in place — the thing
// the wiki exists for. Each mark is a button carrying its question number;
// clicking it opens the matching question row below, and each row can jump
// back to its passage. Each row carries its moment in time (the label only
// once the answer is shown — it often names it) and its source; the foot of
// the article lists all the sources. Reading 80 % of the article marks it read.

const READ_SENTINEL_SHARE = 0.8;

export default function WikiArticle() {
  const { category, cardId } = useParams<{ category: string; cardId: string }>();
  const paths = useTrainerPaths();
  const district = category ? districtBySlug(category) : undefined;
  const cardIndex = cardId ? CARD_IDS.indexOf(cardId) : -1;
  if (!district) return <Navigate to={paths.wiki} replace />;
  if (!cardId || cardIndex < 0) return <Navigate to={paths.wikiCategory(district.slug)} replace />;
  return (
    <ArticleScreen
      key={`${district.slug}/${cardId}`}
      district={district}
      cardId={cardId}
      cardIndex={cardIndex}
    />
  );
}

type ScreenProps = { district: District; cardId: string; cardIndex: number };

function ArticleScreen({ district: d, cardId, cardIndex }: ScreenProps) {
  const paths = useTrainerPaths();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();
  const fiveId = useId();
  const sourcesId = useId();
  const pinned = usePinnedIds();
  const sid = setId(cardId, d.n);
  const questionIds = useMemo(
    () => Array.from({ length: QUESTIONS_PER_SET }, (_, q) => questionId(sid, q)),
    [sid],
  );

  const articles = useCardArticles(cardId);
  const questions = useCardQuestions(cardId);
  const article = articles.data ? findArticle(articles.data, sid) : null;
  const qset: ContentSetQuestions | null = questions.data?.sets[d.n - 1] ?? null;

  const { language, setLanguage } = useQuestionLanguage({ allowBoth: false });
  const title = article ? (language === "de" ? article.titleDe : article.titleEn) : cardId;
  useDocumentTitle(`${title} · The Archive`);

  const reads = useQuery({
    queryKey: qk.quiztopiaWikiReads(),
    queryFn: wikiReadsQuery(),
    staleTime: 60_000,
  });
  const isRead = (reads.data?.reads ?? []).some((r) => r.setId === sid);
  const markRead = useMutation({
    mutationFn: postWikiRead,
    onSuccess: (res) => qc.setQueryData<WikiReads>(qk.quiztopiaWikiReads(), res),
  });
  const { mutate: mutateRead, isPending: marking } = markRead;
  const requestRead = useCallback(() => {
    if (!isRead && !marking) mutateRead({ setId: sid });
  }, [isRead, marking, mutateRead, sid]);

  // Blocks (paragraphs, tables, lists) + marks from the importer's spans.
  const paragraphs: ArticleBlock[] = useMemo(() => {
    if (!article) return [];
    const text = language === "de" ? article.articleDe : article.articleEn;
    return segmentArticle(text, article.answerSpans[language]);
  }, [article, language]);
  const marked = useMemo(() => markedQuestions(paragraphs), [paragraphs]);

  const [shown, setShown] = useState<boolean[]>(() =>
    Array.from({ length: QUESTIONS_PER_SET }, () => false),
  );
  const toggle = useCallback((q: number) => {
    setShown((prev) => prev.map((v, i) => (i === q ? !v : v)));
  }, []);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const jump = useCallback((q: number) => {
    const el = document.getElementById(`q${q + 1}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    setShown((prev) => prev.map((v, i) => (i === q ? true : v)));
  }, []);
  const openRow = useCallback((q: number) => {
    setShown((prev) => prev.map((v, i) => (i === q ? true : v)));
    rowRefs.current[q]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, []);

  // `#q3` deep link: scroll to the passage once the article is in.
  const hash = location.hash;
  useEffect(() => {
    if (paragraphs.length === 0) return;
    const m = /^#q([1-5])$/.exec(hash);
    if (!m) return;
    const q = Number(m[1]) - 1;
    const t = window.setTimeout(() => jump(q), 50);
    return () => window.clearTimeout(t);
  }, [hash, paragraphs.length, jump]);

  // Keys: 1–5 toggle an answer, [ / ] move between cards.
  const prevId = CARD_IDS[cardIndex - 1] ?? null;
  const nextId = CARD_IDS[cardIndex + 1] ?? null;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPlainKey(e) || isTypingTarget(e.target)) return;
      if (e.key >= "1" && e.key <= "5") {
        e.preventDefault();
        toggle(Number(e.key) - 1);
      } else if (e.key === "[" && prevId) {
        e.preventDefault();
        navigate(paths.wikiArticle(d.slug, prevId));
      } else if (e.key === "]" && nextId) {
        e.preventDefault();
        navigate(paths.wikiArticle(d.slug, nextId));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, prevId, nextId, navigate, paths, d.slug]);

  // Auto-mark: a sentinel 80 % of the way through the article.
  // The sentinel is held in state (not a ref) so the observer attaches when
  // the article — and with it the sentinel — appears.
  const [sentinel, setSentinel] = useState<HTMLDivElement | null>(null);
  const sentinelAfter = Math.max(0, Math.ceil(paragraphs.length * READ_SENTINEL_SHARE) - 1);
  // Fires at most once per visit: a failed request must not turn into a
  // retry loop while the sentinel stays on screen (the chip still retries).
  const autoMarked = useRef(false);
  useEffect(() => {
    if (!sentinel || isRead || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (autoMarked.current || !entries.some((en) => en.isIntersecting)) return;
      autoMarked.current = true;
      requestRead();
    });
    io.observe(sentinel);
    return () => io.disconnect();
  }, [sentinel, isRead, requestRead]);

  const questionText = (q: number) =>
    qset ? (language === "de" ? qset.questions[q].de : qset.questions[q].en) : "";
  const answerText = (q: number) =>
    qset ? (language === "de" ? qset.questions[q].answerDe : qset.questions[q].answerEn) : "";

  const failed = articles.isError || questions.isError;
  const loading = !failed && (!article || !qset);

  return (
    <TrainerScreen>
      <PageMain width="3xl" className="flex flex-col gap-5 pb-28">
        <span
          className={cn("block h-1 w-full rounded-full", TONE_STRIP[d.tone])}
          aria-hidden="true"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Eyebrow tone={d.tone} className="flex items-center gap-1.5">
            <BuildingGlyph name={d.building} lit size={14} />
            <Link to={paths.wikiCategory(d.slug)} className="hover:underline">
              {d.label} · {language === "de" ? d.de : d.en}
            </Link>
          </Eyebrow>
          <nav aria-label="Card navigation" className="flex items-center gap-1">
            <CardNavLink
              to={prevId ? paths.wikiArticle(d.slug, prevId) : null}
              label="Previous card"
            >
              <ChevronLeftIcon className="h-4 w-4" />
            </CardNavLink>
            <MicroLabel className="tabular-nums">
              {cardId} · {cardIndex + 1} of {CARD_IDS.length}
            </MicroLabel>
            <CardNavLink to={nextId ? paths.wikiArticle(d.slug, nextId) : null} label="Next card">
              <ChevronRightIcon className="h-4 w-4" />
            </CardNavLink>
          </nav>
        </div>

        {failed && <ErrorAlert message="This article could not be loaded." />}
        {loading && !failed && <LoadingState fillHeight label="Opening the article…" />}

        {article && qset && (
          <>
            <PageHeader
              size="lg"
              title={<span lang={language}>{title}</span>}
              badge={
                isRead ? (
                  <Badge tone="emerald" size="sm" icon={<CheckIcon className="h-3 w-3" />}>
                    Read
                  </Badge>
                ) : undefined
              }
              subtitle={<QuestionDots questionIds={questionIds} />}
              actions={<LanguageToggle value={language} onChange={setLanguage} allowBoth={false} />}
            />

            <Surface variant="tile" padding="md" className="flex flex-col gap-1">
              <MicroLabel>From card {cardId} · original question</MicroLabel>
              <p className="text-sm text-fg-primary" lang={language}>
                {questionText(0)}
              </p>
            </Surface>

            <EditorNote language={language} notesEn={qset.notesEn} notesDe={qset.notesDe} />

            <article
              lang={language}
              className="flex flex-col gap-4 text-base leading-relaxed text-fg-primary"
            >
              <ArticleBody
                blocks={paragraphs}
                tone={d.tone}
                questionText={questionText}
                shown={shown}
                onOpen={openRow}
                sentinelAfter={sentinelAfter}
                setSentinel={setSentinel}
              />
            </article>

            <section aria-labelledby={fiveId} className="flex flex-col gap-2">
              <h2 id={fiveId} className="text-sm font-semibold text-fg-strong">
                Five questions
              </h2>
              <ol className="flex flex-col gap-2">
                {qset.questions.map((question, q) => (
                  <li
                    key={question.id}
                    ref={(el) => {
                      rowRefs.current[q] = el;
                    }}
                  >
                    <Surface
                      variant="tile"
                      padding="md"
                      className={cn(
                        "transition-colors",
                        shown[q] && cn("border", TONE_LIT[d.tone]),
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Badge tone={d.tone} size="sm" className="mt-0.5">
                          Q{q + 1}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-fg-primary" lang={language}>
                            {questionText(q)}
                          </p>
                          {shown[q] && (
                            <p className={cn("mt-1 text-base font-semibold", TONE_TEXT[d.tone])}>
                              {answerText(q)}
                            </p>
                          )}
                          {(question.timeline || question.source) && (
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                              {question.timeline && (
                                <TimelineChip
                                  event={question.timeline}
                                  lang={language}
                                  tone={d.tone}
                                  withLabel={shown[q]}
                                />
                              )}
                              {question.source && (
                                <SourceLink
                                  source={question.source}
                                  titleTooltip={shown[q]}
                                  label={language === "de" ? "Quelle" : "Source"}
                                />
                              )}
                              {question.timeline && pinned.has(question.id) && (
                                <TextLink to={paths.timeline(question.id)}>
                                  {language === "de"
                                    ? "Auf der Zeitleiste →"
                                    : "Show on timeline →"}
                                </TextLink>
                              )}
                            </div>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Button
                              size="xs"
                              variant="secondary"
                              onClick={() => toggle(q)}
                              aria-expanded={shown[q]}
                            >
                              {shown[q] ? "Hide answer" : "Show answer"}
                              <Kbd className="hidden sm:inline-flex">{q + 1}</Kbd>
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => jump(q)}
                              disabled={!marked.has(q)}
                              title={
                                marked.has(q)
                                  ? undefined
                                  : "This answer shares its passage with another"
                              }
                            >
                              Jump to passage
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Surface>
                  </li>
                ))}
              </ol>
            </section>

            <ArticleSources id={sourcesId} questions={qset.questions} language={language} />
          </>
        )}
      </PageMain>

      <div className="sticky bottom-0 z-lift border-t border-line bg-surface-950/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <Chip
            pressed={isRead}
            tone="emerald"
            size="sm"
            icon={<CheckIcon className="h-3.5 w-3.5" />}
            onClick={requestRead}
            disabled={isRead || marking || !article}
            title={isRead ? "You have read this article" : "Mark this article as read"}
          >
            {isRead ? "Read" : "Mark read"}
          </Chip>
          <Button
            variant="primary"
            onClick={() => navigate(paths.study({ set: sid }))}
            disabled={!qset}
          >
            Study this set ({QUESTIONS_PER_SET})
          </Button>
        </div>
      </div>
    </TrainerScreen>
  );
}

function CardNavLink({
  to,
  label,
  children,
}: {
  to: string | null;
  label: string;
  children: ReactNode;
}) {
  const cls =
    "inline-flex h-8 w-8 items-center justify-center rounded-ui-md text-fg-secondary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400/60";
  if (!to) {
    return (
      <span className={cn(cls, "opacity-30")} aria-hidden="true">
        {children}
      </span>
    );
  }
  return (
    <Link
      to={to}
      aria-label={label}
      title={label}
      className={cn(cls, "hover:bg-fill hover:text-fg-strong")}
    >
      {children}
    </Link>
  );
}

/** The article foot: every question's source once, with the questions it backs. */
function ArticleSources({
  id,
  questions,
  language,
}: {
  id: string;
  questions: ContentSetQuestions["questions"];
  language: "en" | "de";
}) {
  const sources = useMemo(() => {
    const byUrl = new Map<
      string,
      { source: NonNullable<(typeof questions)[number]["source"]>; qs: number[] }
    >();
    questions.forEach((question, q) => {
      if (!question.source) return;
      const entry = byUrl.get(question.source.url);
      if (entry) entry.qs.push(q);
      else byUrl.set(question.source.url, { source: question.source, qs: [q] });
    });
    return [...byUrl.values()];
  }, [questions]);
  if (sources.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="text-sm font-semibold text-fg-strong">
        {language === "de" ? "Quellen" : "Sources"}
      </h2>
      <ol className="flex flex-col divide-y divide-line-soft">
        {sources.map(({ source, qs }) => (
          <li key={source.url} className="flex items-center gap-3 py-2">
            <MicroLabel className="w-16 shrink-0 tabular-nums">
              {qs.map((q) => `Q${q + 1}`).join(" · ")}
            </MicroLabel>
            <SourceLink source={source} variant="full" className="min-w-0 flex-1" />
            <MicroLabel className="hidden shrink-0 sm:block">
              {source.lang.toUpperCase()}
            </MicroLabel>
          </li>
        ))}
      </ol>
    </section>
  );
}
