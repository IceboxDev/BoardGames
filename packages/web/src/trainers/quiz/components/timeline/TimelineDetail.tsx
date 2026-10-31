import { formatTimelineDate } from "@boardgames/core/quiz/timeline";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "../../../../components/icons";
import { IconButton, Kbd } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { findFact } from "../../content";
import { domainOf } from "../../domains";
import { useArticle, useQuizIndex } from "../../hooks/useContent";
import { useQuizSettings } from "../../hooks/useQuizSettings";
import { questionOf } from "../../hooks/useTrainerSession";
import type { TimelineItem, TimelineText } from "../../logic/timeline-layout";
import type { TrainerPaths } from "../../paths";
import { SourceLink } from "../common/SourceLink";
import { Headline, JumpLine, Kicker, PrintButton, Stamp } from "../paper/Paper";
import { KICKER } from "../paper/paper-style";
import { ReportButton } from "../report/ReportButton";
import { kindLabel } from "./era-copy";

// One pinned moment, opened: the full date, what happened, the question it
// came from and its answer, the source to cross-check it, and the way back
// into the wiki. Prev / next walk the river in time order (← / →).

type Props = {
  item: TimelineItem;
  lang: "en" | "de" | "ru";
  paths: TrainerPaths;
  position: { index: number; total: number };
  onPrev: (() => void) | null;
  onNext: (() => void) | null;
  onClose: () => void;
  /** The phone sheet draws its own close button and header. */
  embedded?: boolean;
};

function useQuestionText(item: TimelineItem): {
  text: TimelineText | null;
  articleId: string | null;
  pending: boolean;
} {
  const index = useQuizIndex();
  const articleId = index.data?.articleOf(item.questionId)?.id ?? null;
  const article = useArticle(articleId, !item.text);
  const { settings } = useQuizSettings();
  if (item.text) return { text: item.text, articleId, pending: false };
  const found = article.data ? findFact(article.data, item.questionId) : null;
  if (!found) return { text: null, articleId, pending: index.isPending || article.isPending };
  const question = questionOf(found.fact, settings.sources);
  return {
    articleId,
    text: {
      en: question.en,
      de: question.de,
      answerEn: question.answerEn,
      answerDe: question.answerDe,
      ...(question.source ? { source: question.source } : {}),
    },
    pending: false,
  };
}

function studiedOn(iso: string | null, lang: "en" | "de" | "ru"): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(lang === "de" ? "de-DE" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function TimelineDetail({
  item,
  lang,
  paths,
  position,
  onPrev,
  onNext,
  onClose,
  embedded = false,
}: Props) {
  const d = domainOf(item.domain);
  const { text, articleId, pending } = useQuestionText(item);
  const label =
    lang === "de"
      ? item.event.labelDe
      : lang === "ru"
        ? (item.event.labelRu ?? item.event.labelEn)
        : item.event.labelEn;
  const date = formatTimelineDate(item.event, lang, { full: true });
  const studied = studiedOn(item.lastReviewedAt, lang);
  const de = lang === "de";

  return (
    <div className="flex flex-col gap-4" lang={lang}>
      <div className="flex items-center gap-2">
        <Kicker domain={item.domain} icon={20} className="min-w-0" />
        <Stamp tone={item.known ? "emerald" : "accent"}>
          {item.known ? (de ? "Sitzt" : "Known") : de ? "Lernt noch" : "Still learning"}
        </Stamp>
        {!embedded && (
          <IconButton
            variant="ghost"
            size="sm"
            className="ml-auto"
            aria-label={de ? "Schließen" : "Close"}
            title={de ? "Schließen (Esc)" : "Close (Esc)"}
            onClick={onClose}
            icon={<XIcon />}
          />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <span className={cn(KICKER, "text-fg-muted")}>
          {kindLabel(item.event.kind, lang)}
          {item.event.approx ? (de ? " · ungefähr" : " · approximate") : ""}
        </span>
        <Headline as="p" size="lg" className="tabular-nums">
          {date}
        </Headline>
        <p className="font-news text-base italic leading-snug text-fg-secondary">{label}</p>
      </div>

      <div className="flex flex-col gap-3 border-t border-line-strong pt-3">
        {text ? (
          <>
            <div className="flex flex-col gap-1">
              <span className={cn(KICKER, "text-fg-muted")}>{de ? "Frage" : "Question"}</span>
              <p className="font-news text-sm leading-relaxed text-fg-primary">
                {de ? text.de : text.en}
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <span className={cn(KICKER, d.ink)}>{de ? "Antwort" : "Answer"}</span>
              <p className={cn("font-headline text-xl font-bold leading-snug", d.ink)}>
                {de ? text.answerDe : text.answerEn}
              </p>
            </div>
            {text.source && (
              <div className="flex flex-col gap-1">
                <span className={cn(KICKER, "text-fg-muted")}>{de ? "Quelle" : "Source"}</span>
                <SourceLink source={text.source} variant="full" />
              </div>
            )}
          </>
        ) : pending ? (
          <p className="font-news text-sm italic text-fg-muted">
            {de ? "Lade die Frage…" : "Loading the question…"}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {articleId && (
            <>
              <JumpLine to={paths.wikiArticle(articleId, item.questionId)}>
                {de ? "Im Archiv lesen" : "Read in the archive"}
              </JumpLine>
              <JumpLine to={paths.study({ article: articleId })}>
                {de ? "Artikel üben" : "Study this article"}
              </JumpLine>
            </>
          )}
          <ReportButton
            variant="labelled"
            label={de ? "Datum melden" : "Report wrong date"}
            className="ml-auto"
            context={{
              target: { kind: "question", id: item.questionId },
              title: text ? (de ? text.de : text.en) : item.questionId,
              domain: item.domain,
              surface: "timeline",
              presetIssue: "wrong-date",
              language: lang,
            }}
          />
        </div>
        {studied && (
          <p className="font-news text-xs italic text-fg-muted">
            {de ? `Zuletzt geübt am ${studied}` : `Last studied ${studied}`}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line-strong pt-3">
        <PrintButton
          onClick={onPrev ?? undefined}
          disabled={!onPrev}
          title={de ? "Früher (←)" : "Earlier (←)"}
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          {de ? "Früher" : "Earlier"}
          <Kbd className="hidden sm:inline-flex">←</Kbd>
        </PrintButton>
        <span className={cn(KICKER, "tabular-nums text-fg-muted")}>
          {position.index + 1} of {position.total}
        </span>
        <PrintButton
          onClick={onNext ?? undefined}
          disabled={!onNext}
          title={de ? "Später (→)" : "Later (→)"}
        >
          <Kbd className="hidden sm:inline-flex">→</Kbd>
          {de ? "Später" : "Later"}
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </PrintButton>
      </div>
    </div>
  );
}
