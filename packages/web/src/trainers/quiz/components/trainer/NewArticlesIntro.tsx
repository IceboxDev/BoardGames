import type { QuizLanguages, WikiReads } from "@boardgames/core/protocol";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { Button, Eyebrow, LoadingState, MicroLabel, Surface } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { qk } from "../../../../lib/query-keys";
import { postWikiRead } from "../../api";
import { bodyIn } from "../../content";
import { coreToneOf, domainOf, TONE_STRIP } from "../../domains";
import { useArticle } from "../../hooks/useContent";
import { useQuizSettings } from "../../hooks/useQuizSettings";
import { questionOf } from "../../hooks/useTrainerSession";
import { isScreenShortcut } from "../../keys";
import { fieldIn, inLang } from "../../logic/text";
import { ArticleImage } from "../common/ArticleImage";
import { ArticleBody } from "../wiki/ArticleBody";
import { segmentArticle } from "../wiki/article-segments";

// The learning half of the day: before any card is dealt, the day's new
// articles are read one after another, every answer marked. Only then does
// the session shuffle their facts in with everything due. Each article read
// here also counts as read in the wiki.

type Props = {
  /** The new articles of this session, in reading order. */
  articles: readonly { articleId: string; domain: string }[];
  index: number;
  language: QuizLanguages;
  /** Cards in the session, for the "start" button. */
  cardCount: number;
  onNext: () => void;
  onSkip: () => void;
};

export function NewArticlesIntro({ articles, index, language, cardCount, onNext, onSkip }: Props) {
  const current = articles[index];
  const d = domainOf(current.domain);
  const lang = language.primary;
  const { settings } = useQuizSettings();
  const article = useArticle(current.articleId).data ?? null;
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
  const last = index === articles.length - 1;

  // Reading it here is reading it: mark the article read in the wiki too.
  const qc = useQueryClient();
  const { mutate: markRead } = useMutation({
    mutationFn: postWikiRead,
    onSuccess: (res) => qc.setQueryData<WikiReads>(qk.quizWikiReads(), res),
  });
  const next = () => {
    markRead({ articleId: current.articleId });
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
      if (!isScreenShortcut(e)) return;
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
        <Eyebrow tone={coreToneOf(d.tone)}>
          New today · article {index + 1} of {articles.length}
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
          {d.label} · {inLang(lang, d)}
        </MicroLabel>
        {!article ? (
          <LoadingState label="Opening the article…" />
        ) : (
          <>
            <h2 className="text-xl font-bold text-fg-strong sm:text-2xl">
              {fieldIn(article, "title", lang)}
            </h2>
            {article.images[0] && <ArticleImage image={article.images[0]} lang={lang} />}
            <div className="flex flex-col gap-3 text-sm leading-relaxed text-fg-primary sm:text-base">
              <ArticleBody
                blocks={blocks}
                tone={d.tone}
                anchorOf={(i) => `intro-${article.facts[i]?.id ?? i}`}
                questionText={questionText}
                shown={article.facts.map(() => true)}
                onOpen={() => {}}
                sentinelAfter={-1}
                setSentinel={() => {}}
              />
            </div>
          </>
        )}
      </Surface>
      <p className="text-xs text-fg-muted">
        The marked passages are what you'll be asked. After the last article, its facts are shuffled
        in with everything due.
      </p>
      <div className="flex justify-end">
        <Button variant="primary" onClick={next} disabled={!article}>
          {last ? `Start the quiz (${cardCount})` : "Next article"}
        </Button>
      </div>
    </div>
  );
}
