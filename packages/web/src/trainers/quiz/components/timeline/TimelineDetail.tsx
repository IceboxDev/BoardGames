import { formatTimelineDate } from "@boardgames/core/quiz/timeline";
import { ChevronLeftIcon, ChevronRightIcon, XIcon } from "../../../../components/icons";
import { Badge, Button, Eyebrow, IconButton, Kbd, MicroLabel } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { findFact } from "../../content";
import { domainOf } from "../../domains";
import { useArticle, useQuizIndex } from "../../hooks/useContent";
import { useQuizSettings } from "../../hooks/useQuizSettings";
import { questionOf } from "../../hooks/useTrainerSession";
import type { TimelineItem, TimelineText } from "../../logic/timeline-layout";
import type { TrainerPaths } from "../../paths";
import { SourceLink } from "../common/SourceLink";
import { TextLink } from "../common/TextLink";
import { ReportButton } from "../report/ReportButton";
import { kindLabel } from "./era-copy";
import { DATE_INK } from "./tones";

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
        <Badge tone={d.tone} size="sm" title={`${d.label} · ${d.en} / ${d.de}`}>
          {de ? d.de : d.en}
        </Badge>
        <Badge tone={item.known ? "emerald" : "amber"} size="xs">
          {item.known ? (de ? "Sitzt" : "Known") : de ? "Lernt noch" : "Still learning"}
        </Badge>
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
        <MicroLabel>
          {kindLabel(item.event.kind, lang)}
          {item.event.approx ? (de ? " · ungefähr" : " · approximate") : ""}
        </MicroLabel>
        <p className={cn("text-2xl font-bold leading-tight tabular-nums", DATE_INK[d.tone])}>
          {date}
        </p>
        <p className="text-base font-medium leading-snug text-fg-strong">{label}</p>
      </div>

      <div className="flex flex-col gap-3 border-t border-line-soft pt-3">
        {text ? (
          <>
            <div className="flex flex-col gap-1">
              <Eyebrow size="sm">{de ? "Frage" : "Question"}</Eyebrow>
              <p className="text-sm leading-relaxed text-fg-secondary">{de ? text.de : text.en}</p>
            </div>
            <div className="flex flex-col gap-1">
              <Eyebrow size="sm" className={DATE_INK[d.tone]}>
                {de ? "Antwort" : "Answer"}
              </Eyebrow>
              <p className={cn("text-lg font-semibold leading-snug", DATE_INK[d.tone])}>
                {de ? text.answerDe : text.answerEn}
              </p>
            </div>
            {text.source && (
              <div className="flex flex-col gap-1">
                <Eyebrow size="sm">{de ? "Quelle" : "Source"}</Eyebrow>
                <SourceLink source={text.source} variant="full" />
              </div>
            )}
          </>
        ) : pending ? (
          <p className="text-sm text-fg-muted">
            {de ? "Lade die Frage…" : "Loading the question…"}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {articleId && (
            <>
              <TextLink to={paths.wikiArticle(articleId, item.questionId)}>
                {de ? "Im Wiki lesen →" : "Read in the wiki →"}
              </TextLink>
              <TextLink tone="muted" to={paths.study({ article: articleId })}>
                {de ? "Artikel üben" : "Study this article"}
              </TextLink>
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
          <p className="text-2xs text-fg-muted">
            {de ? `Zuletzt geübt am ${studied}` : `Last studied ${studied}`}
          </p>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line-soft pt-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={onPrev ?? undefined}
          disabled={!onPrev}
          title={de ? "Früher (←)" : "Earlier (←)"}
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" />
          {de ? "Früher" : "Earlier"}
          <Kbd className="hidden sm:inline-flex">←</Kbd>
        </Button>
        <MicroLabel className="tabular-nums">
          {position.index + 1} / {position.total}
        </MicroLabel>
        <Button
          size="sm"
          variant="secondary"
          onClick={onNext ?? undefined}
          disabled={!onNext}
          title={de ? "Später (→)" : "Later (→)"}
        >
          <Kbd className="hidden sm:inline-flex">→</Kbd>
          {de ? "Später" : "Later"}
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
