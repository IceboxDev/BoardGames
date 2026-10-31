import type { QuizLanguages, WikiReads } from "@boardgames/core/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { XIcon } from "../../../../components/icons";
import { IconButton, Kbd, LoadingState } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { qk } from "../../../../lib/query-keys";
import { postWikiRead, todayKey } from "../../api";
import { bodyIn } from "../../content";
import { domainOf } from "../../domains";
import { useArticle, useQuizIndex } from "../../hooks/useContent";
import { useQuizSettings } from "../../hooks/useQuizSettings";
import { questionOf } from "../../hooks/useTrainerSession";
import { isScreenShortcut } from "../../keys";
import { fieldIn, inLang } from "../../logic/text";
import { DomainIcon } from "../common/DomainIcon";
import { LanguageToggle } from "../common/LanguageToggle";
import { FEATURE_HEADLINE, FEATURE_WIDTH, FeatureBody } from "../paper/FeatureBody";
import {
  BoxedPanel,
  Byline,
  Folio,
  Headline,
  Kicker,
  Masthead,
  PaperButton,
  PrintButton,
  SectionHead,
} from "../paper/Paper";
import { editionNumber, KICKER, longDate } from "../paper/paper-style";
import { ReadingProgress } from "../paper/ReadingProgress";
import { segmentArticle } from "../wiki/article-segments";

// The learning half of the day, set as the edition's inside pages: before any
// card is dealt, the day's new articles are read one after another — page A2,
// A3, A4 — each set as a feature in one column, every answer underlined. A
// rail lists the day's pages and turns to the next; after the last comes the Quiz Page,
// where their facts are shuffled in with everything due. Each article read
// here also counts as read in the archive.

const WORDS_PER_MINUTE = 220;

type Props = {
  /** The new articles of this session, in reading order. */
  articles: readonly { articleId: string; domain: string }[];
  index: number;
  language: QuizLanguages;
  onLanguage: (next: QuizLanguages) => void;
  /** Cards in the session, for the Quiz Page entry. */
  cardCount: number;
  /** Questions each article brings to today's Quiz Page. */
  questionsOf: (articleId: string) => number;
  onNext: () => void;
  onSkip: () => void;
  onClose: () => void;
  homeTo: string;
};

export function NewArticlesIntro({
  articles,
  index,
  language,
  onLanguage,
  cardCount,
  questionsOf,
  onNext,
  onSkip,
  onClose,
  homeTo,
}: Props) {
  const current = articles[index];
  const d = domainOf(current.domain);
  const lang = language.primary;
  const { settings } = useQuizSettings();
  const article = useArticle(current.articleId).data ?? null;
  const contents = useQuizIndex();
  const today = useMemo(() => todayKey(), []);
  const questionText = (i: number) => {
    const fact = article?.facts[i];
    if (!fact) return "";
    return inLang(lang, questionOf(fact, settings.sources));
  };
  const blocks = useMemo(() => {
    if (!article) return [];
    const { body, spans } = bodyIn(article, lang);
    return segmentArticle(body, spans);
  }, [article, lang]);
  const minutes = article
    ? Math.max(1, Math.round(bodyIn(article, lang).body.split(/\s+/).length / WORDS_PER_MINUTE))
    : 0;
  const last = index === articles.length - 1;
  const page = (i: number) => `A${i + 2}`;
  const quizPage = page(articles.length);

  // Reading it here is reading it: mark the article read in the archive too.
  const qc = useQueryClient();
  const { mutate: markRead } = useMutation({
    mutationFn: postWikiRead,
    onSuccess: (res) => qc.setQueryData<WikiReads>(qk.quizWikiReads(), res),
  });
  const next = () => {
    markRead({ articleId: current.articleId });
    onNext();
  };

  // A new page starts at its top.
  const top = useRef<HTMLDivElement | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on article change only
  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" });
  }, [index]);

  // Enter / → turn the page; the flash-card keys are off while reading.
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isScreenShortcut(e)) return;
      if (e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        nextRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const turn = last
    ? `To the Quiz Page · ${cardCount} questions`
    : `Turn to page ${page(index + 1)}`;

  return (
    <div ref={top} className="flex min-h-full flex-col px-4 pt-3 md:px-6 xl:px-10">
      <Masthead
        compact
        className="shrink-0"
        edition={`No. ${editionNumber(today)}`}
        dateLine={longDate(today)}
        pageLabel={`Page ${page(index)}`}
        homeTo={homeTo}
        nav={
          <>
            <PrintButton onClick={onSkip} className="mr-2 hidden text-fg-muted md:inline-flex">
              Skip reading
            </PrintButton>
            <span className="hidden md:flex">
              <LanguageToggle
                value={language}
                onChange={onLanguage}
                size="xs"
                allowSecondary={false}
              />
            </span>
            <IconButton
              variant="ghost"
              size="sm"
              aria-label="Close the edition"
              title="Back to the front page (Esc)"
              onClick={onClose}
              icon={<XIcon />}
            />
          </>
        }
      />
      <ReadingProgress color={d.color} />

      <main className="grid flex-1 gap-8 py-5 lg:grid-cols-[minmax(0,1fr)_17rem] xl:grid-cols-[minmax(0,1fr)_19rem]">
        <article lang={lang} className="flex min-w-0 flex-col gap-5">
          <header className={cn(FEATURE_WIDTH, "flex flex-col gap-3")}>
            <Kicker domain={d.slug} icon={28} className="justify-center">
              {` · New today · article ${index + 1} of ${articles.length}`}
            </Kicker>
            {article && (
              <>
                <Headline as="h1" size="xl" className={FEATURE_HEADLINE}>
                  {fieldIn(article, "title", lang)}
                </Headline>
                <Byline
                  left={`Page ${page(index)}`}
                  right={`${minutes} min read · ${article.facts.length} answers underlined`}
                />
              </>
            )}
          </header>
          {!article ? (
            <LoadingState label="Setting the page…" />
          ) : (
            <FeatureBody
              domain={d.slug}
              images={article.images}
              lang={lang}
              blocks={blocks}
              tone={d.tone}
              anchorOf={(i) => `intro-${article.facts[i]?.id ?? i}`}
              questionText={questionText}
              shown={article.facts.map(() => true)}
              onOpen={() => {}}
              sentinelAfter={-1}
              setSentinel={() => {}}
            />
          )}
        </article>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
          <section aria-label="In today's edition" className="flex flex-col gap-1">
            <SectionHead>In today's edition</SectionHead>
            <ol className="flex flex-col">
              {articles.map((a, i) => {
                const entry = contents.data?.article(a.articleId);
                const state = i < index ? "read" : i === index ? "now" : "next";
                return (
                  <li
                    key={a.articleId}
                    aria-current={state === "now" ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 border-b border-dotted border-line-strong py-2",
                      state === "next" && "opacity-60",
                    )}
                  >
                    <DomainIcon domain={a.domain} size={40} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span
                        className={cn(
                          KICKER,
                          state === "now" ? "text-accent-300" : "text-fg-muted",
                        )}
                      >
                        Page {page(i)}
                        {state === "read" ? " · ✓ read" : state === "now" ? " · reading" : ""}
                      </span>
                      <span className="line-clamp-2 font-headline text-sm font-bold leading-snug text-fg-strong">
                        {entry ? fieldIn(entry, "title", lang) : "…"}
                      </span>
                      <span className="font-news text-xs italic text-fg-muted">
                        {questionsOf(a.articleId)} questions
                      </span>
                    </span>
                  </li>
                );
              })}
              <li className="flex items-center gap-3 py-2">
                <span className="flex size-10 shrink-0 items-center justify-center border-3 border-double border-line-strong font-headline text-lg font-black text-fg-strong">
                  ?
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={cn(KICKER, "text-sky-300")}>Page {quizPage}</span>
                  <span className="font-headline text-sm font-bold text-fg-strong">
                    The Quiz Page
                  </span>
                  <span className="font-news text-xs italic text-fg-muted">
                    {cardCount} questions, new and due, shuffled
                  </span>
                </span>
              </li>
            </ol>
          </section>

          <BoxedPanel className="flex flex-col gap-1 p-3">
            <span className={cn(KICKER, "text-fg-primary")}>How to read it</span>
            <p className="font-news text-sm leading-snug text-fg-secondary">
              The{" "}
              <span
                className="font-semibold text-fg-strong underline decoration-2 underline-offset-4"
                style={{ textDecorationColor: d.color }}
              >
                underlined
              </span>{" "}
              passages are what you'll be asked. The article stays closed while you answer.
            </p>
          </BoxedPanel>

          <div className="flex flex-col gap-1.5">
            <PaperButton primary size="lg" block onClick={next} disabled={!article}>
              {turn}
            </PaperButton>
            <span className="hidden items-center justify-center gap-1.5 font-news text-xs italic text-fg-muted sm:flex">
              or press <Kbd>Enter</Kbd>
            </span>
            <PrintButton onClick={onSkip} className="self-center text-fg-muted">
              Skip to the Quiz Page
            </PrintButton>
          </div>
        </aside>
      </main>

      {/* On a phone the rail falls below the story: the next page stays a tap away. */}
      <div className="sticky bottom-0 z-lift -mx-4 border-t border-line-strong bg-surface-900/95 px-4 py-2.5 backdrop-blur md:-mx-6 md:px-6 lg:hidden">
        <PaperButton primary size="lg" block onClick={next} disabled={!article}>
          {turn}
        </PaperButton>
      </div>

      <Folio page={page(index)} right={`article ${index + 1} of ${articles.length}`} />
    </div>
  );
}
