import type { ReaderHint } from "@boardgames/core/games/quiztopia/types";
import { useState } from "react";
import { GameDialogPanel } from "../../../../components/game-layout/GameDialogPanel";
import { Badge, Chip } from "../../../../components/ui";
import { type BoardLanguage, pickTexts } from "../../logic/copy";

// The private answer surface. The reader holds the physical card, so they
// see the answer from the moment a building is picked; a Datenleak peeker
// sees it too. Neither is ever announced to the live region, and the panel
// disappears once the answer is public (the QuestionPanel shows it then).
// Mount it keyed by the turn so "Hide" resets every question.

type Props = {
  mode: "reader" | "peek";
  answerEn: string;
  answerDe: string;
  lang: BoardLanguage;
  /** "Anna" / "You" — who reveals. */
  activeName: string;
  readerHint: ReaderHint | null;
};

export default function ReaderStrip({
  mode,
  answerEn,
  answerDe,
  lang,
  activeName,
  readerHint,
}: Props) {
  const [hidden, setHidden] = useState(false);
  const answers = pickTexts(lang, answerEn, answerDe);
  const title = mode === "reader" ? "You read this one" : "Data leak — only you see this";
  const subtitle =
    mode === "reader"
      ? `Keep it to yourself until ${activeName} reveals.`
      : "You sit out any Plenum on this question.";

  return (
    <GameDialogPanel tone="arcane" title={title} subtitle={subtitle}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {hidden ? (
            <p className="text-sm text-fg-muted">Answer hidden</p>
          ) : (
            answers.map((text, i) => (
              <p
                key={text}
                className={
                  i === 0
                    ? "text-lg font-bold leading-tight text-fg-strong"
                    : "text-sm font-medium text-fg-secondary"
                }
              >
                {text}
              </p>
            ))
          )}
          {mode === "reader" && readerHint === "word" && (
            <Badge tone="purple" size="xs" className="mt-2">
              Insider tip — you may say exactly one word
            </Badge>
          )}
          {mode === "reader" && readerHint === "mime" && (
            <Badge tone="purple" size="xs" className="mt-2">
              Benefit performance — act it out, no words
            </Badge>
          )}
        </div>
        <Chip pressed={false} size="xs" onClick={() => setHidden((h) => !h)}>
          {hidden ? "Show" : "Hide"}
        </Chip>
      </div>
    </GameDialogPanel>
  );
}
