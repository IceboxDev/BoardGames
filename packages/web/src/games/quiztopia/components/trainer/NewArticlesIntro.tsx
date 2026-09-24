import type { QuiztopiaLanguage, WikiReads } from "@boardgames/core/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { Button, Eyebrow, LoadingState, MicroLabel, Surface } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { qk } from "../../../../lib/query-keys";
import { postWikiRead } from "../../api";
import { districtByN, TONE_STRIP } from "../../bands";
import { findArticle } from "../../content";
import { useCardArticles, useCardQuestions } from "../../hooks/useContent";
import { isPlainKey, isTypingTarget } from "../../keys";
import { ArticleBody } from "../wiki/ArticleBody";
import { segmentArticle } from "../wiki/article-segments";

// The learning half of a whole-set day: before any card is dealt, the day's
// new articles are read one after another, their five answers marked. Only
// then does the session shuffle those questions in with everything due. Each
// article read here also counts as read in the wiki.

type Props = {
  /** The new sets of this session, in reading order. */
  sets: readonly { setId: string; cardId: string; category: number }[];
  index: number;
  language: QuiztopiaLanguage;
  /** Cards in the session, for the "start" button. */
  cardCount: number;
  onNext: () => void;
  onSkip: () => void;
};

export function NewArticlesIntro({ sets, index, language, cardCount, onNext, onSkip }: Props) {
  const current = sets[index];
  const d = districtByN(current.category);
  const lang = language === "de" ? "de" : "en";
  const articles = useCardArticles(current.cardId);
  const article = articles.data ? findArticle(articles.data, current.setId) : null;
  const questions = useCardQuestions(current.cardId);
  const qset = questions.data?.sets[current.category - 1] ?? null;
  const questionText = (q: number) =>
    qset ? (lang === "de" ? qset.questions[q].de : qset.questions[q].en) : "";
  const blocks = useMemo(
    () =>
      article
        ? segmentArticle(
            lang === "de" ? article.articleDe : article.articleEn,
            article.answerSpans[lang],
          )
        : [],
    [article, lang],
  );
  const last = index === sets.length - 1;

  // Reading it here is reading it: mark the article read in the wiki too.
  const qc = useQueryClient();
  const { mutate: markRead } = useMutation({
    mutationFn: postWikiRead,
    onSuccess: (res) => qc.setQueryData<WikiReads>(qk.quiztopiaWikiReads(), res),
  });
  const next = () => {
    markRead({ setId: current.setId });
    onNext();
  };

  // A new article starts at its top.
  const top = useRef<HTMLDivElement | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on article change only
  useEffect(() => {
    top.current?.scrollIntoView({ block: "start" });
  }, [index]);

  // Enter / → move on; the flash-card keys are off while reading.
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isPlainKey(e) || isTypingTarget(e.target)) return;
      if (e.key === "Enter" || e.key === "ArrowRight") {
        e.preventDefault();
        nextRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div ref={top} className="flex scroll-mt-24 flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Eyebrow tone={d.tone}>
          New today · article {index + 1} of {sets.length}
        </Eyebrow>
        <Button variant="link" size="xs" onClick={onSkip}>
          Skip reading
        </Button>
      </div>
      <Surface variant="raised" padding="xl" className="flex flex-col gap-4 sm:p-6">
        <span
          className={cn("block h-1 w-full rounded-full", TONE_STRIP[d.tone])}
          aria-hidden="true"
        />
        <MicroLabel>
          {d.label} · {lang === "de" ? d.de : d.en}
        </MicroLabel>
        {!article ? (
          <LoadingState label="Opening the article…" />
        ) : (
          <>
            <h2 className="text-xl font-bold text-fg-strong sm:text-2xl">
              {lang === "de" ? article.titleDe : article.titleEn}
            </h2>
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-fg-primary sm:text-base">
              <ArticleBody
                blocks={blocks}
                tone={d.tone}
                questionText={questionText}
                shown={[true, true, true, true, true]}
                onOpen={() => {}}
                sentinelAfter={-1}
                setSentinel={() => {}}
              />
            </div>
          </>
        )}
      </Surface>
      <p className="text-xs text-fg-muted">
        The marked passages are what you'll be asked. After the last article, its questions are
        shuffled in with everything due.
      </p>
      <div className="flex justify-end">
        <Button variant="primary" onClick={next} disabled={!article}>
          {last ? `Start the quiz (${cardCount})` : "Next article"}
        </Button>
      </div>
    </div>
  );
}
