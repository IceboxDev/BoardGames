import { CARDS_PER_GAME, type TurnView } from "@boardgames/core/games/quiztopia/types";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useId } from "react";
import { Badge, Eyebrow, MicroLabel, Surface, TONE_TEXT } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import { districtByIndex, TONE_STRIP } from "../../bands";
import { answerHints, type BoardLanguage, cardRefLabel, pickTexts } from "../../logic/copy";
import { AnswerMark } from "../common/AnswerMark";
import { BuildingGlyph } from "../common/BuildingGlyph";
import { LanguageToggle } from "../common/LanguageToggle";
import { EditorNote } from "../wiki/EditorNote";
import { useArticleSnippet } from "./use-article-snippet";

// This turn's question card: band strip, category, card ref, the question in
// the chosen language(s), and the answer — a hidden tile until the active
// seat reveals it, then the answer blurring in with the article sentence and
// the rulings the table forgets. Reader-only and Datenleak answers never
// render here; `ReaderStrip` is that private surface.

type Props = {
  turn: TurnView;
  cardsUsed: number;
  /** The public reveal happened (everyone sees the answer). */
  revealed: boolean;
  /** Who reveals — "Anna" / "You". */
  revealerLabel: string;
  lang: BoardLanguage;
  onLangChange: (lang: BoardLanguage) => void;
  className?: string;
};

export default function QuestionPanel({
  turn,
  cardsUsed,
  revealed,
  revealerLabel,
  lang,
  onLangChange,
  className,
}: Props) {
  const reduced = useReducedMotion();
  const headingId = useId();
  const q = turn.question;
  const primaryLang: "en" | "de" = lang === "de" ? "de" : "en";
  const snippet = useArticleSnippet(
    q?.cardRef ?? null,
    q?.categoryIndex ?? null,
    primaryLang,
    revealed && !!q?.answerEn,
  );
  if (!q) return null;
  const d = districtByIndex(q.categoryIndex);
  const questions = pickTexts(lang, q.en, q.de);
  const answerEn = q.answerEn ?? "";
  const answerDe = q.answerDe ?? "";
  const answers = revealed && q.answerEn != null ? pickTexts(lang, answerEn, answerDe) : [];
  const hints = revealed ? answerHints(primaryLang === "de" ? answerDe : answerEn) : [];

  return (
    <Surface
      variant="raised"
      padding="none"
      className={cn("relative overflow-hidden", className)}
      aria-labelledby={headingId}
    >
      <span className={cn("block h-1 w-full", TONE_STRIP[d.tone])} aria-hidden="true" />
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            tone={d.tone}
            size="sm"
            icon={<BuildingGlyph name={d.building} lit size={12} />}
            title={`${d.label} · ${d.en} / ${d.de}`}
          >
            {d.label} · {primaryLang === "de" ? d.de : d.en}
          </Badge>
          <MicroLabel>{cardRefLabel(q.cardRef, q.categoryIndex)}</MicroLabel>
          <span className="ml-auto flex items-center gap-2">
            <MicroLabel className="tabular-nums">
              Q{Math.max(1, cardsUsed)} of {CARDS_PER_GAME}
            </MicroLabel>
            <LanguageToggle value={lang} onChange={onLangChange} />
          </span>
        </div>

        <div id={headingId} className="flex flex-col gap-1">
          {questions.map((text, i) => (
            <p
              key={text}
              className={cn(
                i === 0
                  ? "text-lg font-semibold leading-snug text-fg-strong sm:text-2xl"
                  : "text-sm text-fg-secondary sm:text-base",
              )}
              lang={i === 0 ? primaryLang : primaryLang === "en" ? "de" : "en"}
            >
              {text}
            </p>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {!revealed ? (
            <motion.div
              key="hidden"
              exit={reduced ? undefined : { opacity: 0 }}
              className="flex items-center gap-3 rounded-card-lg border border-dashed border-line bg-fill-soft px-3 py-2.5"
            >
              <span aria-hidden="true" className="text-lg">
                🔒
              </span>
              <p className="text-xs text-fg-secondary">
                Answer hidden — {revealerLabel} reveal{revealerLabel === "You" ? "" : "s"} when the
                table has decided.
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="revealed"
              initial={reduced ? false : { opacity: 0, filter: "blur(8px)", y: 4 }}
              animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
              transition={{ duration: reduced ? 0 : 0.45, ease: "easeOut" }}
              className="flex flex-col gap-2"
            >
              <Eyebrow tone={d.tone} size="sm">
                Answer
              </Eyebrow>
              {answers.map((text, i) => (
                <p
                  key={text}
                  className={cn(
                    i === 0
                      ? cn("text-xl font-bold leading-tight sm:text-2xl", TONE_TEXT[d.tone])
                      : "text-sm font-medium text-fg-secondary",
                  )}
                >
                  {text}
                </p>
              ))}
              {snippet && (
                <p className="text-xs leading-relaxed text-fg-secondary">
                  <span className="text-fg-muted">From the article: </span>
                  {snippet.before}
                  <AnswerMark tone={d.tone}>{snippet.match}</AnswerMark>
                  {snippet.after}
                </p>
              )}
              {hints.length > 0 && (
                <ul className="flex flex-wrap gap-x-3 gap-y-1">
                  {hints.map((h) => (
                    <li key={h} className="text-2xs text-fg-muted">
                      {h}
                    </li>
                  ))}
                </ul>
              )}
              <EditorNote language={lang} notesEn={q.notesEn} notesDe={q.notesDe} size="xs" />
            </motion.div>
          )}
        </AnimatePresence>

        {(turn.readerHint || turn.shield || turn.discards > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {turn.readerHint === "word" && (
              <Badge tone="purple" size="xs" title="Insider tip: the reader may say one word">
                One-word tip allowed
              </Badge>
            )}
            {turn.readerHint === "mime" && (
              <Badge tone="purple" size="xs" title="Benefit performance: the reader may act it out">
                Pantomime allowed
              </Badge>
            )}
            {turn.shield && (
              <Badge tone="emerald" size="xs" title="Streik: a wrong answer changes nothing">
                Strike — no penalty this turn
              </Badge>
            )}
            {turn.discards > 0 && (
              <Badge tone="neutral" size="xs">
                {turn.discards} discarded this turn
              </Badge>
            )}
          </div>
        )}
      </div>
    </Surface>
  );
}
