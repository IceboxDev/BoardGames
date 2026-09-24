import { isLeech, type SrsState } from "@boardgames/core/games/quiztopia/srs";
import type { QuiztopiaLanguage } from "@boardgames/core/protocol";
import { motion, useReducedMotion } from "framer-motion";
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
import { type District, TONE_STRIP } from "../../bands";
import type { Snippet } from "../../content";
import type { CurrentCard } from "../../hooks/useTrainerSession";
import { pickTexts } from "../../logic/copy";
import { AnswerMark } from "../common/AnswerMark";
import { BuildingGlyph } from "../common/BuildingGlyph";
import { TextLink } from "../common/TextLink";
import { EditorNote } from "../wiki/EditorNote";

// The study card. Front: the question, in the chosen language(s). Back: the
// answer in the district's ink, the article sentence that gives it away,
// and the editor's note when the card has one. The reveal is a real flip
// (rotateY on a preserve-3d stack); with reduced motion the faces crossfade
// instead. Both faces share one grid cell, so the card's height is the
// taller face and the grade bar never jumps.

type Props = {
  card: CurrentCard;
  district: District;
  state: SrsState | null;
  revealed: boolean;
  language: QuiztopiaLanguage;
  snippet: Snippet | null;
  snippetPending: boolean;
  articleHref: string;
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
  district: d,
  state,
  revealed,
  language,
  snippet,
  snippetPending,
  articleHref,
  onReveal,
  className,
}: Props) {
  const reduced = useReducedMotion();
  const flip = !reduced;
  const primary: "en" | "de" = language === "de" ? "de" : "en";
  const questions = pickTexts(language, card.question.en, card.question.de);
  const answers = pickTexts(language, card.question.answerEn, card.question.answerDe);
  const tier = tierBadge(state);
  const ref = `${card.item.cardId} · Q${card.q + 1}${card.q === 0 ? " · original" : ""}`;

  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        tone={d.tone}
        size="sm"
        icon={<BuildingGlyph name={d.building} lit size={12} />}
        title={`${d.label} · ${d.en} / ${d.de}`}
      >
        {d.label} · {primary === "de" ? d.de : d.en}
      </Badge>
      <Badge tone={tier.tone} size="xs">
        {tier.label}
      </Badge>
      <MicroLabel className="ml-auto">{ref}</MicroLabel>
    </div>
  );

  const face = "col-start-1 row-start-1 flex min-h-64 flex-col";

  return (
    <div className={cn("w-full", className)} style={{ perspective: 1400 }}>
      <motion.div
        className="grid"
        style={{ transformStyle: flip ? "preserve-3d" : undefined }}
        animate={{ rotateY: flip && revealed ? 180 : 0 }}
        transition={flip ? boardSpring : { duration: 0 }}
      >
        {/* Front */}
        <motion.div
          className={face}
          style={{ backfaceVisibility: "hidden" }}
          animate={{ opacity: !flip && revealed ? 0 : 1 }}
          transition={{ duration: 0.2 }}
          inert={revealed}
          aria-hidden={revealed}
        >
          <Surface variant="raised" padding="none" className="flex flex-1 flex-col overflow-hidden">
            <span className={cn("block h-1 w-full", TONE_STRIP[d.tone])} aria-hidden="true" />
            <Button
              variant="plain"
              bleed
              align="start"
              onClick={onReveal}
              className="cursor-pointer text-left hover:bg-fill-soft"
            >
              <div className="flex w-full flex-1 flex-col gap-4 p-5">
                {header}
                <div className="flex flex-1 flex-col justify-center gap-2 py-4">
                  {questions.map((text, i) => (
                    <p
                      key={text}
                      lang={i === 0 ? primary : primary === "en" ? "de" : "en"}
                      className={
                        i === 0
                          ? "text-lg font-semibold leading-snug text-fg-strong sm:text-xl"
                          : "text-sm text-fg-secondary"
                      }
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
            </Button>
          </Surface>
        </motion.div>

        {/* Back */}
        <motion.div
          className={face}
          style={{
            backfaceVisibility: "hidden",
            transform: flip ? "rotateY(180deg)" : undefined,
          }}
          animate={{ opacity: !flip && !revealed ? 0 : 1 }}
          transition={{ duration: 0.2 }}
          inert={!revealed}
          aria-hidden={!revealed}
        >
          <Surface variant="raised" padding="none" className="flex flex-1 flex-col overflow-hidden">
            <span className={cn("block h-1 w-full", TONE_STRIP[d.tone])} aria-hidden="true" />
            <div className="flex flex-1 flex-col gap-4 p-5">
              {header}
              <p className="text-sm text-fg-secondary" lang={primary}>
                {questions[0]}
              </p>
              <div className="flex flex-col gap-1">
                <Eyebrow tone={d.tone} size="sm">
                  Answer
                </Eyebrow>
                {answers.map((text, i) => (
                  <p
                    key={text}
                    className={
                      i === 0
                        ? cn("text-2xl font-bold leading-tight", TONE_TEXT[d.tone])
                        : "text-base font-medium text-fg-secondary"
                    }
                  >
                    {text}
                  </p>
                ))}
              </div>
              {snippet ? (
                <p className="text-sm leading-relaxed text-fg-secondary" lang={primary}>
                  <span className="text-fg-muted">From the article: </span>
                  {snippet.before}
                  <AnswerMark tone={d.tone}>{snippet.match}</AnswerMark>
                  {snippet.after}
                </p>
              ) : snippetPending ? (
                <p className="text-sm text-fg-muted">Finding the passage…</p>
              ) : null}
              <div>
                <TextLink to={articleHref}>Read full article →</TextLink>
              </div>
              {card.set.notes && <EditorNote>{card.set.notes}</EditorNote>}
            </div>
          </Surface>
        </motion.div>
      </motion.div>
    </div>
  );
}
