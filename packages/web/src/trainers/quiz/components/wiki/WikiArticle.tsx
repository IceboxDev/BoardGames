import type { QuizLang } from "@boardgames/core/protocol";
import type { Fact, SourceLink as SourceLinkData } from "@boardgames/core/quiz/content-types";
import { ARTICLE_ID_RE } from "@boardgames/core/quiz/ids";
import { sourceById } from "@boardgames/core/quiz/sources";
import { leadWording, printedSources } from "@boardgames/core/quiz/wordings";
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
import { bodyIn } from "../../content";
import { coreToneOf, domainOf, subName, TONE_LIT, TONE_STRIP } from "../../domains";
import { useArticle, useQuizIndex } from "../../hooks/useContent";
import { usePinnedIds } from "../../hooks/usePinnedTimeline";
import { usePrimaryLanguage } from "../../hooks/useQuestionLanguage";
import { useQuizSettings } from "../../hooks/useQuizSettings";
import { useWikiRead } from "../../hooks/useWikiRead";
import { isScreenShortcut } from "../../keys";
import { fieldIn, inLang, say } from "../../logic/text";
import { useTrainerPaths } from "../../paths";
import { ArticleImage } from "../common/ArticleImage";
import { PrimaryLanguageToggle } from "../common/LanguageToggle";
import { SourceLink } from "../common/SourceLink";
import { TextLink } from "../common/TextLink";
import { ReportButton } from "../report/ReportButton";
import { TimelineChip } from "../timeline/TimelineChip";
import { TrainerScreen } from "../trainer/TrainerScreen";
import { ArticleBody } from "./ArticleBody";
import { ArticleHistory, CardTextHint, RetiredQuestions } from "./ArticleHistory";
import { type ArticleBlock, markedQuestions, segmentArticle } from "./article-segments";
import { EditorNote } from "./EditorNote";
import { QuestionDots } from "./QuestionDots";

// One article — a whole topic page — with every fact's answer highlighted in
// place: the thing the wiki exists for. Each mark is a button carrying its
// fact's number; clicking it opens the matching question row below, and each
// row can jump back to its passage. Each row asks its fact in the wording
// the member's sources prefer, says which games print it, and carries its
// moment in time (the label only once the answer is shown — it often names
// it) and its source; the foot of the article lists all the sources.
// Reading 80 % of the article marks it read.

const READ_SENTINEL_SHARE = 0.8;

/** A fact as its row shows it: the wording the member's sources prefer. */
interface FactRow {
  id: string;
  en: string;
  de: string;
  ru?: string;
  answerEn: string;
  answerDe: string;
  answerRu?: string;
  timeline: Fact["timeline"];
  source: Fact["source"];
}

function rowOf(fact: Fact, sources: readonly string[]): FactRow {
  const wording = leadWording(fact.wordings, sources);
  return {
    id: fact.id,
    en: wording.en,
    de: wording.de,
    ru: wording.ru,
    answerEn: fact.answerEn,
    answerDe: fact.answerDe,
    answerRu: fact.answerRu,
    timeline: fact.timeline,
    source: fact.source,
  };
}

export default function WikiArticle() {
  const { articleId } = useParams<{ articleId: string }>();
  const paths = useTrainerPaths();
  if (!articleId || !ARTICLE_ID_RE.test(articleId)) return <Navigate to={paths.wiki} replace />;
  return <ArticleScreen key={articleId} articleId={articleId} />;
}

function ArticleScreen({ articleId }: { articleId: string }) {
  const paths = useTrainerPaths();
  const navigate = useNavigate();
  const location = useLocation();
  const factsId = useId();
  const sourcesId = useId();
  const pinned = usePinnedIds();
  const { settings } = useQuizSettings();

  const index = useQuizIndex();
  const entry = index.data?.article(articleId);
  const articleQ = useArticle(articleId);
  const article = articleQ.data ?? null;
  const d = domainOf(article?.domain ?? entry?.domain);
  const factIds = useMemo(() => article?.facts.map((f) => f.id) ?? [], [article]);
  const questions: FactRow[] = useMemo(
    () => article?.facts.map((f) => rowOf(f, settings.sources)) ?? [],
    [article, settings.sources],
  );

  // Prev / next: the same sub-category of the same domain, in index order.
  const siblings = useMemo(() => {
    if (!index.data || !entry) return [];
    return index.data.articles.filter((a) => a.domain === entry.domain && a.sub === entry.sub);
  }, [index.data, entry]);
  const position = siblings.findIndex((a) => a.id === articleId);
  const prevId = position > 0 ? (siblings[position - 1]?.id ?? null) : null;
  const nextId = position >= 0 ? (siblings[position + 1]?.id ?? null) : null;

  // An article page is one text: the main language only.
  const { language, setPrimary } = usePrimaryLanguage();
  const title = article ? fieldIn(article, "title", language) : "";
  useDocumentTitle(`${title || "Article"} · The Archive`);

  const wikiRead = useWikiRead(articleId);
  const { isRead, setRead } = wikiRead;
  const requestRead = useCallback(() => setRead(true), [setRead]);

  // Blocks (paragraphs, tables, lists) + marks from the facts' spans.
  const paragraphs: ArticleBlock[] = useMemo(() => {
    if (!article) return [];
    const { body, spans } = bodyIn(article, language);
    return segmentArticle(body, spans);
  }, [article, language]);
  const marked = useMemo(() => markedQuestions(paragraphs), [paragraphs]);

  const [shown, setShown] = useState<boolean[]>([]);
  const toggle = useCallback((q: number) => {
    setShown((prev) => {
      const next = [...prev];
      next[q] = !next[q];
      return next;
    });
  }, []);
  const reveal = useCallback((q: number) => {
    setShown((prev) => {
      const next = [...prev];
      next[q] = true;
      return next;
    });
  }, []);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  const jump = useCallback(
    (q: number) => {
      const id = factIds[q];
      if (!id) return;
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      reveal(q);
    },
    [factIds, reveal],
  );
  const openRow = useCallback(
    (q: number) => {
      reveal(q);
      rowRefs.current[q]?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    },
    [reveal],
  );

  // `#f00042` deep link: scroll to that fact's passage once the article is in.
  const hash = location.hash;
  useEffect(() => {
    if (paragraphs.length === 0) return;
    const q = factIds.indexOf(hash.slice(1));
    if (q < 0) return;
    const t = window.setTimeout(() => jump(q), 50);
    return () => window.clearTimeout(t);
  }, [hash, paragraphs.length, factIds, jump]);

  // Keys: 1–9 toggle an answer, [ / ] move between articles of the topic.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isScreenShortcut(e)) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= factIds.length) {
        e.preventDefault();
        toggle(n - 1);
      } else if (e.key === "[" && prevId) {
        e.preventDefault();
        navigate(paths.wikiArticle(prevId));
      } else if (e.key === "]" && nextId) {
        e.preventDefault();
        navigate(paths.wikiArticle(nextId));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, prevId, nextId, navigate, paths, factIds.length]);

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

  const questionText = (q: number) => {
    const question = questions[q];
    return question ? inLang(language, question) : "";
  };
  const answerText = (q: number) => {
    const question = questions[q];
    return question
      ? inLang(language, { en: question.answerEn, de: question.answerDe, ru: question.answerRu })
      : "";
  };

  const failed = articleQ.isError;
  const loading = !failed && !article;
  const sub = entry ? subName(d, entry.sub, language) : null;

  return (
    <TrainerScreen>
      <PageMain width="3xl" className="flex flex-col gap-5 pb-28">
        <span
          className={cn("block h-1 w-full rounded-full", TONE_STRIP[d.tone])}
          aria-hidden="true"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Eyebrow tone={coreToneOf(d.tone)}>
            <Link to={paths.wikiDomain(d.slug)} className="hover:underline">
              {d.label} · {inLang(language, d)}
            </Link>
            {sub && ` · ${sub}`}
          </Eyebrow>
          <nav aria-label="Article navigation" className="flex items-center gap-1">
            <CardNavLink to={prevId ? paths.wikiArticle(prevId) : null} label="Previous article">
              <ChevronLeftIcon className="h-4 w-4" />
            </CardNavLink>
            {position >= 0 && (
              <MicroLabel className="tabular-nums">
                {position + 1} of {siblings.length}
              </MicroLabel>
            )}
            <CardNavLink to={nextId ? paths.wikiArticle(nextId) : null} label="Next article">
              <ChevronRightIcon className="h-4 w-4" />
            </CardNavLink>
          </nav>
        </div>

        {failed && <ErrorAlert message="This article could not be loaded." />}
        {loading && !failed && <LoadingState fillHeight label="Opening the article…" />}

        {article && (
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
              subtitle={<QuestionDots questionIds={factIds} />}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <ReportButton
                    variant="labelled"
                    context={{
                      target: { kind: "article", id: articleId },
                      title,
                      domain: d.slug,
                      surface: "wiki",
                      language,
                    }}
                  />
                  <PrimaryLanguageToggle value={language} onChange={setPrimary} />
                </div>
              }
            />

            <EditorNote
              language={{ primary: language, secondary: null }}
              notesEn={article.notesEn}
              notesDe={article.notesDe}
              notesRu={article.notesRu}
            />

            {article.images.length > 0 && (
              <div className="flex flex-col gap-3">
                <ArticleImage image={article.images[0]} lang={language} />
                {article.images.length > 1 && (
                  <div className="flex flex-wrap items-start justify-center gap-3">
                    {article.images.slice(1).map((img) => (
                      <ArticleImage
                        key={img.url}
                        image={img}
                        lang={language}
                        className="max-w-60 [&_img]:max-h-40"
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            <article
              lang={language}
              className="flex flex-col gap-4 text-base leading-relaxed text-fg-primary"
            >
              <ArticleBody
                blocks={paragraphs}
                tone={d.tone}
                anchorOf={(q) => factIds[q] ?? `fact-${q}`}
                questionText={questionText}
                shown={shown}
                onOpen={openRow}
                sentinelAfter={sentinelAfter}
                setSentinel={setSentinel}
              />
            </article>

            <section aria-labelledby={factsId} className="flex flex-col gap-2">
              <h2 id={factsId} className="text-sm font-semibold text-fg-strong">
                {questions.length === 1 ? "One question" : `${questions.length} questions`}
              </h2>
              <ol className="flex flex-col gap-2">
                {questions.map((question, q) => (
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
                          <CardTextHint
                            wordings={article.facts[q]?.wordings ?? []}
                            lang={language}
                          />
                          <PrintedIn wordings={article.facts[q]?.wordings ?? []} />
                          {shown[q] && (
                            <p
                              className={cn(
                                "mt-1 text-base font-semibold",
                                TONE_TEXT[coreToneOf(d.tone)],
                              )}
                            >
                              {answerText(q)}
                            </p>
                          )}
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                            <TimelineChip
                              event={question.timeline}
                              lang={language}
                              tone={d.tone}
                              withLabel={shown[q] === true}
                            />
                            <SourceLink
                              source={question.source}
                              titleTooltip={shown[q] === true}
                              label={say(language, { en: "Source", de: "Quelle", ru: "Источник" })}
                            />
                            {pinned.has(question.id) && (
                              <TextLink to={paths.timeline(question.id)}>
                                {say(language, {
                                  en: "Show on timeline →",
                                  de: "Auf der Zeitleiste →",
                                  ru: "На шкале времени →",
                                })}
                              </TextLink>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Button
                              size="xs"
                              variant="secondary"
                              onClick={() => toggle(q)}
                              aria-expanded={shown[q] === true}
                            >
                              {shown[q] ? "Hide answer" : "Show answer"}
                              {q < 9 && <Kbd className="hidden sm:inline-flex">{q + 1}</Kbd>}
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
                            <ReportButton
                              className="ml-auto"
                              context={{
                                target: { kind: "question", id: question.id },
                                title: questionText(q),
                                domain: d.slug,
                                surface: "wiki",
                                // A hidden answer stays hidden: no answer-giving issues yet.
                                hideSpoilers: !shown[q],
                                language,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </Surface>
                  </li>
                ))}
              </ol>
            </section>

            <RetiredQuestions article={article} lang={language} />

            <ArticleSources id={sourcesId} questions={questions} language={language} />

            <ArticleHistory article={article} lang={language} />
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
            onClick={() => setRead(!isRead)}
            disabled={!wikiRead.loaded || !article}
            title={isRead ? "Read — click to mark it unread" : "Mark this article as read"}
            aria-label={isRead ? "Read. Mark as unread" : "Mark as read"}
          >
            {isRead ? "Read" : "Mark read"}
          </Chip>
          <Button
            variant="primary"
            onClick={() => navigate(paths.study({ article: articleId }))}
            disabled={!article}
          >
            Study this article ({factIds.length})
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

/** "Printed in Quiztopia · Trivial Pursuit" — the games that ask this fact. */
function PrintedIn({ wordings }: { wordings: Parameters<typeof printedSources>[0] }) {
  const games = printedSources(wordings).map((s) => sourceById(s)?.title ?? s);
  if (games.length === 0) return null;
  return <MicroLabel className="mt-1">Printed in {games.join(" · ")}</MicroLabel>;
}

/** The article foot: every question's source once, with the questions it backs. */
function ArticleSources({
  id,
  questions,
  language,
}: {
  id: string;
  questions: readonly FactRow[];
  language: QuizLang;
}) {
  const sources = useMemo(() => {
    const byUrl = new Map<string, { source: SourceLinkData; qs: number[] }>();
    questions.forEach((question, q) => {
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
        {say(language, { en: "Sources", de: "Quellen", ru: "Источники" })}
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
