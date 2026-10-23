import type { QuizLang, QuizLanguages } from "@boardgames/core/protocol";
import { isLeech, type SrsState } from "@boardgames/core/quiz/srs";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { useEffect, useRef } from "react";
import { boardSpring } from "../../../../components/board/motion";
import {
  Badge,
  Button,
  Eyebrow,
  Kbd,
  MicroLabel,
  Surface,
  TONE_TEXT,
} from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import type { Snippet } from "../../content";
import { coreToneOf, type Domain, TONE_STRIP } from "../../domains";
import type { CurrentCard } from "../../hooks/useTrainerSession";
import { inLang, inLangs, reportLanguageOf, say } from "../../logic/text";
import { AnswerMark } from "../common/AnswerMark";
import { ArticleImage } from "../common/ArticleImage";
import { SourceLink } from "../common/SourceLink";
import { TextLink } from "../common/TextLink";
import { ReportButton } from "../report/ReportButton";
import { TimelineChip } from "../timeline/TimelineChip";
import { EditorNote } from "../wiki/EditorNote";

// The study card. Front: the question, in the chosen language(s). Back: the
// answer in the domain's ink, the article sentence that gives it away,
// the question's moment on the member's timeline and its source, and the
// editor's note when the card has one. The reveal is a real flip
// (rotateY on a preserve-3d stack); with reduced motion the faces swap
// without turning. Both faces share one grid cell, so the card's height is the
// taller face and the grade bar never jumps. The back holds the card it
// was revealed on while it turns away, so grading never flashes the next
// card's answer mid-flip.

type Props = {
  card: CurrentCard;
  domain: Domain;
  state: SrsState | null;
  revealed: boolean;
  language: QuizLanguages;
  snippet: Snippet | null;
  snippetPending: boolean;
  articleHref: string;
  /** The timeline focused on this question. */
  timelineHref: string;
  onReveal: () => void;
  className?: string;
};

function tierBadge(state: SrsState | null) {
  if (!state) return { label: "New", tone: "sky" as const };
  if (isLeech(state)) return { label: "Leech", tone: "rose" as const };
  switch (state.state) {
    case "review":
      return { label: "Due", tone: "neutral" as const };
    case "relearning":
      return { label: "Lapsed", tone: "rose" as const };
    default:
      return { label: "Learning", tone: "amber" as const };
  }
}

export function FlashCard({
  card,
  domain: d,
  state,
  revealed,
  language,
  snippet,
  snippetPending,
  articleHref,
  timelineHref,
  onReveal,
  className,
}: Props) {
  const reduced = useReducedMotion();
  const flip = !reduced;
  const primary = language.primary;
  const questions = inLangs(language, card.question);

  // What the back shows: the live card while revealed, else the card it
  // was last revealed on (turning away, or already turned).
  const live: BackView = {
    card,
    domain: d,
    state,
    snippet,
    snippetPending,
    articleHref,
    timelineHref,
  };
  const held = useRef(live);
  if (revealed) held.current = live;
  const back = revealed ? live : held.current;

  // One rotation drives everything. Each face's visibility is switched from
  // that angle (front up to 90°, back past it) rather than trusted to
  // `backface-visibility`: Firefox still paints positioned descendants of a
  // backface-hidden face, which showed the question mirrored through the
  // translucent back. Reduced motion skips the turn and swaps at once.
  const rotation = useMotionValue(revealed ? 180 : 0);
  useEffect(() => {
    const controls = animate(rotation, revealed ? 180 : 0, flip ? boardSpring : { duration: 0 });
    return () => controls.stop();
  }, [rotation, revealed, flip]);
  const frontVisibility = useTransform(rotation, (deg) => (deg < 90 ? "visible" : "hidden"));
  const backVisibility = useTransform(rotation, (deg) => (deg >= 90 ? "visible" : "hidden"));
  const turn = useTransform(rotation, (deg) => (flip ? deg : 0));

  const face = "col-start-1 row-start-1 flex min-h-64 min-w-0 flex-col";
  const hiddenBackface = {
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  } as const;

  return (
    <div className={cn("w-full min-w-0", className)} style={{ perspective: 1400 }}>
      <motion.div
        className="grid grid-cols-1"
        style={{ transformStyle: flip ? "preserve-3d" : undefined, rotateY: turn }}
      >
        {/* Front */}
        <motion.div
          className={face}
          style={{ ...hiddenBackface, visibility: frontVisibility }}
          inert={revealed}
          aria-hidden={revealed}
        >
          <Surface
            variant="raised"
            padding="none"
            className="relative flex min-w-0 flex-1 flex-col overflow-hidden"
          >
            <span className={cn("block h-1 w-full", TONE_STRIP[d.tone])} aria-hidden="true" />
            {/* The text lays out as ordinary flow; the tap target is a
                full-card overlay, so no button's intrinsic sizing (which
                iOS Safari lets grow past the screen) ever reaches it. */}
            <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
              <CardHeader
                card={card}
                domain={d}
                state={state}
                primary={primary}
                language={language}
                revealed={false}
              />
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-2 py-4">
                {questions.map((text, i) => (
                  <p
                    key={text}
                    lang={i === 0 ? primary : (language.secondary ?? primary)}
                    className={cn(
                      "hyphens-auto break-words",
                      i === 0
                        ? "text-lg font-semibold leading-snug text-fg-strong sm:text-xl"
                        : "text-sm text-fg-secondary",
                    )}
                  >
                    {text}
                  </p>
                ))}
              </div>
              <p className="flex items-center gap-1.5 text-2xs text-fg-muted">
                Tap to reveal
                <Kbd className="hidden sm:inline-flex">Space</Kbd>
              </p>
            </div>
            <Button
              variant="plain"
              bleed
              aria-label="Reveal the answer"
              onClick={onReveal}
              className="absolute inset-0 z-lift cursor-pointer hover:bg-fill-soft"
            />
          </Surface>
        </motion.div>

        {/* Back */}
        <motion.div
          className={face}
          style={{
            ...hiddenBackface,
            visibility: backVisibility,
            transform: flip ? "rotateY(180deg)" : undefined,
          }}
          inert={!revealed}
          aria-hidden={!revealed}
        >
          <BackFace view={back} language={language} primary={primary} />
        </motion.div>
      </motion.div>
    </div>
  );
}

type BackView = {
  card: CurrentCard;
  domain: Domain;
  state: SrsState | null;
  snippet: Snippet | null;
  snippetPending: boolean;
  articleHref: string;
  timelineHref: string;
};

function CardHeader({
  card,
  domain: d,
  state,
  primary,
  language,
  revealed,
}: {
  card: CurrentCard;
  domain: Domain;
  state: SrsState | null;
  primary: QuizLang;
  language: QuizLanguages;
  /** The back face: every issue may be reported; the front hides answer-giving ones. */
  revealed: boolean;
}) {
  const tier = tierBadge(state);
  const ref = `${card.item.articleId} · ${card.index + 1}/${card.article.facts.length}${
    card.question.printed ? " · printed" : ""
  }`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone={d.tone} size="sm" title={`${d.label} · ${d.en} / ${d.de}`}>
        {d.label} · {inLang(primary, d)}
      </Badge>
      <Badge tone={tier.tone} size="xs">
        {tier.label}
      </Badge>
      <MicroLabel className="ml-auto">{ref}</MicroLabel>
      <ReportButton
        context={{
          target: { kind: "question", id: card.item.questionId },
          title: inLang(primary, card.question),
          domain: card.item.domain,
          surface: "trainer",
          hideSpoilers: !revealed,
          language: reportLanguageOf(language),
        }}
      />
    </div>
  );
}

function BackFace({
  view,
  language,
  primary,
}: {
  view: BackView;
  language: QuizLanguages;
  primary: QuizLang;
}) {
  const { card, domain: d, state, snippet, snippetPending, articleHref, timelineHref } = view;
  const questions = inLangs(language, card.question);
  const answers = inLangs(language, {
    en: card.question.answerEn,
    de: card.question.answerDe,
    ru: card.question.answerRu,
  });
  const image = card.article.images[0];
  return (
    <Surface
      variant="raised"
      padding="none"
      className="flex min-w-0 flex-1 flex-col overflow-hidden break-words"
    >
      <span className={cn("block h-1 w-full", TONE_STRIP[d.tone])} aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col gap-4 p-5">
        <CardHeader
          card={card}
          domain={d}
          state={state}
          primary={primary}
          language={language}
          revealed
        />
        <p className="text-sm text-fg-secondary" lang={primary}>
          {questions[0]}
        </p>
        <div className="flex flex-col gap-1">
          <Eyebrow tone={coreToneOf(d.tone)} size="sm">
            {say(primary, { en: "Answer", de: "Antwort", ru: "Ответ" })}
          </Eyebrow>
          {answers.map((text, i) => (
            <p
              key={text}
              className={
                i === 0
                  ? cn("text-2xl font-bold leading-tight", TONE_TEXT[coreToneOf(d.tone)])
                  : "text-base font-medium text-fg-secondary"
              }
            >
              {text}
            </p>
          ))}
        </div>
        {snippet ? (
          <div className="flex items-start gap-3">
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-fg-secondary" lang={primary}>
              <span className="text-fg-muted">
                {say(primary, {
                  en: "From the article: ",
                  de: "Aus dem Artikel: ",
                  ru: "Из статьи: ",
                })}
              </span>
              {snippet.before}
              <AnswerMark tone={d.tone}>{snippet.match}</AnswerMark>
              {snippet.after}
            </p>
            {image && <ArticleImage image={image} lang={primary} variant="thumb" />}
          </div>
        ) : snippetPending ? (
          <p className="text-sm text-fg-muted">Finding the passage…</p>
        ) : null}
        <div>
          <TextLink to={articleHref}>Read full article →</TextLink>
        </div>
        {(card.question.timeline || card.question.source) && (
          <div className="flex flex-col items-start gap-1.5">
            {card.question.timeline && (
              <TimelineChip
                event={card.question.timeline}
                lang={primary}
                tone={d.tone}
                caption={
                  state
                    ? say(primary, {
                        en: "Pinned to your timeline",
                        de: "Auf deiner Zeitleiste",
                        ru: "На вашей шкале времени",
                      })
                    : say(primary, {
                        en: "Pins to your timeline",
                        de: "Kommt auf deine Zeitleiste",
                        ru: "Появится на вашей шкале времени",
                      })
                }
                to={timelineHref}
              />
            )}
            {card.question.source && (
              <SourceLink
                source={card.question.source}
                label={say(primary, { en: "Source", de: "Quelle", ru: "Источник" })}
              />
            )}
          </div>
        )}
        <EditorNote
          language={language}
          notesEn={card.article.notesEn}
          notesDe={card.article.notesDe}
          notesRu={card.article.notesRu}
        />
      </div>
    </Surface>
  );
}
