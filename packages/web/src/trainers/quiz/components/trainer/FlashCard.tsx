import type { QuizLang, QuizLanguages } from "@boardgames/core/protocol";
import { isLeech, type SrsState } from "@boardgames/core/quiz/srs";
import { formatTimelineDate } from "@boardgames/core/quiz/timeline";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "framer-motion";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { boardSpring } from "../../../../components/board/motion";
import { EditIcon, PinIcon } from "../../../../components/icons";
import { Button, Kbd, Surface, TONE_TEXT } from "../../../../components/ui";
import { sourceDomain } from "../../../../games/quiztopia/logic/copy";
import { cn } from "../../../../lib/cn";
import type { Snippet } from "../../content";
import type { Domain } from "../../domains";
import type { CurrentCard } from "../../hooks/useTrainerSession";
import { inLang, inLangs, notesIn, reportLanguageOf, say } from "../../logic/text";
import { sourceMarkOf } from "../../source-marks";
import { AnswerMark } from "../common/AnswerMark";
import { DomainIcon } from "../common/DomainIcon";
import { SourceMarkIcon } from "../common/SourceLabel";
import { TextLink } from "../common/TextLink";
import { ReportButton } from "../report/ReportButton";
import { EditorNote } from "../wiki/EditorNote";

// The study card: one fixed frame of three bands, the same on every card and
// both faces, so nothing moves from card to card. A one-line meta bar
// (domain, status, source stamp, flag — fixed slots, never wrapping), the
// body, and a footer (the card's reference, and the article link once
// revealed). The card fills the screen between the header and the grade
// bar; its text adapts, its edges don't. Front: the question, centred in the
// body. Back: the question small, the answer in the domain's own colour, the
// article sentence that gives it away, then a band of context cells —
// timeline, source, editor's note (opened in place). The reveal is a real
// flip (rotateY on a preserve-3d stack); with reduced motion the faces swap
// without turning. The back holds the card it was revealed on while it turns
// away, so grading never flashes the next card's answer mid-flip.

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

function tierOf(state: SrsState | null) {
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

/** The band padding, shared so every band's text starts on one edge. */
const INSET = "px-4 md:px-7";

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

  // The frame's size comes from the screen, never from a face: both faces
  // lie over the same box.
  const face = "absolute inset-0 flex min-w-0";
  const hiddenBackface = {
    backfaceVisibility: "hidden",
    WebkitBackfaceVisibility: "hidden",
  } as const;

  return (
    <div
      className={cn("relative min-h-80 w-full min-w-0 flex-1 lg:max-h-160", className)}
      style={{ perspective: 1400 }}
    >
      <motion.div
        className="absolute inset-0"
        style={{ transformStyle: flip ? "preserve-3d" : undefined, rotateY: turn }}
      >
        {/* Front */}
        <motion.div
          className={face}
          style={{ ...hiddenBackface, visibility: frontVisibility }}
          inert={revealed}
          aria-hidden={revealed}
        >
          <Frame
            meta={
              <MetaBar
                card={card}
                domain={d}
                state={state}
                primary={primary}
                language={language}
                revealed={false}
              />
            }
            footer={
              <>
                <CardRef card={card} />
                <span className="flex items-center gap-1.5">
                  <span className="sm:hidden">Tap the card to reveal</span>
                  <span className="hidden sm:inline">Click or press</span>
                  <Kbd className="hidden sm:inline-flex">Space</Kbd>
                </span>
              </>
            }
          >
            {/* The text lays out as ordinary flow; the tap target is a
                full-card overlay, so no button's intrinsic sizing (which
                iOS Safari lets grow past the screen) ever reaches it. */}
            <div className={cn("flex min-h-0 flex-1 flex-col overflow-y-auto py-5", INSET)}>
              <div className="my-auto flex max-w-2xl flex-col gap-2">
                {questions.map((text, i) => (
                  <p
                    key={text}
                    lang={i === 0 ? primary : (language.secondary ?? primary)}
                    className={cn(
                      "hyphens-auto break-words",
                      i === 0
                        ? "text-xl font-semibold leading-snug text-fg-strong sm:text-2xl lg:text-3xl"
                        : "text-sm text-fg-secondary lg:text-base",
                    )}
                  >
                    {text}
                  </p>
                ))}
              </div>
            </div>
            <Button
              variant="plain"
              bleed
              aria-label="Reveal the answer"
              onClick={onReveal}
              className="absolute inset-0 z-lift cursor-pointer rounded-none hover:bg-fill-soft"
            />
          </Frame>
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

/** The three bands: meta bar, body, footer — the same heights on every card. */
function Frame({
  meta,
  footer,
  children,
}: {
  meta: ReactNode;
  footer: ReactNode;
  children: ReactNode;
}) {
  return (
    <Surface
      variant="raised"
      padding="none"
      className="relative flex min-w-0 flex-1 flex-col overflow-hidden break-words"
    >
      {meta}
      {children}
      <div
        className={cn(
          "flex h-11 shrink-0 items-center justify-between gap-3 border-t border-line-soft text-2xs tabular-nums text-fg-muted",
          INSET,
        )}
      >
        {footer}
      </div>
    </Surface>
  );
}

/**
 * One line that never wraps: the domain (its name truncates), the status in
 * a fixed slot, the source stamp in a fixed slot (stamp alone on phones, the
 * full name as its tooltip), the flag.
 */
function MetaBar({
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
  const tier = tierOf(state);
  const mark = sourceMarkOf(card.question.wordingSource);
  return (
    <div className="grid h-12 shrink-0 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 border-b border-line-soft pl-4 pr-2 md:gap-5 md:pl-7">
      <span
        className="flex min-w-0 items-center gap-2 text-xs font-medium text-fg-secondary"
        title={`${d.en} / ${d.de}`}
      >
        <DomainIcon domain={d.slug} size={24} />
        <span className="truncate">{inLang(primary, d)}</span>
      </span>
      <span
        className={cn(
          "flex w-16 items-center gap-1.5 text-2xs font-semibold",
          TONE_TEXT[tier.tone],
        )}
      >
        <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
        {tier.label}
      </span>
      <span
        className="flex items-center gap-1.5 text-2xs text-fg-secondary sm:w-28"
        title={mark.title}
      >
        <SourceMarkIcon source={card.question.wordingSource} className="size-6" />
        <span className="sr-only">Source: </span>
        <span className="truncate max-sm:sr-only">{mark.short}</span>
      </span>
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

function CardRef({ card }: { card: CurrentCard }) {
  return (
    <span className="truncate uppercase">
      {card.item.articleId} · {card.index + 1}/{card.article.facts.length}
    </span>
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
  const { timeline, source } = card.question;
  const hasNote =
    notesIn(language, {
      en: card.article.notesEn,
      de: card.article.notesDe,
      ru: card.article.notesRu,
    }).length > 0;
  // The note stays open only on the card it was opened on.
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const noteOpen = hasNote && noteFor === card.item.questionId;
  const cell =
    "flex min-w-0 items-center gap-2 py-2.5 text-xs text-fg-secondary transition-colors hover:bg-fill-soft focus:outline-none focus-visible:bg-fill md:flex-1 md:py-3";

  return (
    <Frame
      meta={
        <MetaBar
          card={card}
          domain={d}
          state={state}
          primary={primary}
          language={language}
          revealed
        />
      }
      footer={
        <>
          <CardRef card={card} />
          <TextLink to={articleHref} className="shrink-0">
            {say(primary, {
              en: "Read the article →",
              de: "Zum Artikel →",
              ru: "Читать статью →",
            })}
          </TextLink>
        </>
      }
    >
      <div className={cn("flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-5 md:py-8", INSET)}>
        <p className="max-w-3xl text-sm text-fg-secondary md:text-base" lang={primary}>
          {questions[0]}
        </p>
        <div className="flex flex-col gap-1">
          {answers.map((text, i) => (
            <p
              key={text}
              style={i === 0 ? { color: d.color } : undefined}
              className={
                i === 0
                  ? "text-3xl font-bold leading-tight lg:text-4xl"
                  : "text-base font-medium text-fg-secondary lg:text-lg"
              }
            >
              {text}
            </p>
          ))}
        </div>
        {snippet ? (
          <p
            className="max-w-3xl border-l-2 pl-3 text-sm leading-relaxed text-fg-secondary lg:text-base"
            style={{ borderColor: `color-mix(in srgb, ${d.color} 50%, transparent)` }}
            lang={primary}
          >
            {snippet.before}
            <AnswerMark tone={d.tone} variant="print" domain={d.slug}>
              {snippet.match}
            </AnswerMark>
            {snippet.after}
          </p>
        ) : snippetPending ? (
          <p className="border-l-2 border-line pl-3 text-sm text-fg-muted">Finding the passage…</p>
        ) : null}
      </div>

      {(timeline || source || hasNote) && (
        <div className="relative shrink-0">
          {noteOpen && (
            <div className="absolute inset-x-3 bottom-full z-raised mb-2 rounded-card-md bg-surface-800 shadow-xl">
              <EditorNote
                language={language}
                notesEn={card.article.notesEn}
                notesDe={card.article.notesDe}
                notesRu={card.article.notesRu}
              />
            </div>
          )}
          <div className="flex flex-col divide-y divide-line-soft border-t border-line-soft md:flex-row md:divide-x md:divide-y-0">
            {timeline && (
              <Link
                to={timelineHref}
                lang={primary}
                className={cn(cell, INSET, "md:grow-2")}
                title={`${
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
                } · ${formatTimelineDate(timeline, primary)}`}
              >
                <PinIcon className="size-3.5 shrink-0 text-fg-muted" />
                <span className="shrink-0 font-semibold tabular-nums" style={{ color: d.color }}>
                  {formatTimelineDate(timeline, primary)}
                </span>
                <span className="truncate">{timelineLabel(timeline, primary)}</span>
              </Link>
            )}
            {source && (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                hrefLang={source.lang}
                title={source.title}
                className={cn(cell, INSET)}
              >
                <span className="shrink-0 text-fg-muted">
                  {say(primary, { en: "Source", de: "Quelle", ru: "Источник" })}
                </span>
                <span className="truncate text-accent-300">{sourceDomain(source.url)}</span>
                <span aria-hidden="true" className="shrink-0 text-accent-300">
                  ↗
                </span>
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            )}
            {hasNote && (
              <Button
                variant="plain"
                bleed
                aria-expanded={noteOpen}
                onClick={() => setNoteFor(noteOpen ? null : card.item.questionId)}
                className={cn(cell, INSET, "justify-start rounded-none text-amber-300")}
              >
                <EditIcon className="size-3.5 shrink-0" />
                <span className="truncate">
                  {say(primary, {
                    en: "Editor's note",
                    de: "Anmerkung der Redaktion",
                    ru: "Примечание редакции",
                  })}
                </span>
              </Button>
            )}
          </div>
        </div>
      )}
    </Frame>
  );
}

function timelineLabel(
  event: NonNullable<CurrentCard["question"]["timeline"]>,
  lang: QuizLang,
): string {
  if (lang === "de") return event.labelDe;
  if (lang === "ru") return event.labelRu ?? event.labelEn;
  return event.labelEn;
}
