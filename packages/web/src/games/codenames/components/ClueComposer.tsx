import {
  type ClueCount,
  type ClueVerdict,
  clueProblem,
  clueVerdict,
  formatClueCount,
  MAX_CLUE_COUNT,
  MAX_CLUE_LENGTH,
} from "@boardgames/core/games/codenames/clue-rules";
import type { Language } from "@boardgames/core/games/codenames/words/index";
import { useEffect, useState } from "react";
import { MinusIcon, PlusIcon } from "../../../components/icons";
import { Button, IconButton, Input } from "../../../components/ui";
import { cn } from "../../../lib/cn";

// The spymaster's clue form, shared by Codenames and Duet, sized for the
// table header. It checks the word with the same `clueProblem` the server
// runs, so an illegal clue is explained before it is sent.
//
// The spymaster may tap their own cards on the board to mark what the clue
// means: the number follows the marked cards until it is set by hand, and the
// marks are kept (secretly) for the end-of-game review.
//
// With `ask` (classic Codenames), a word that only shares spelling with a
// table word (SPARROW with ROW out) isn't refused: the button becomes "Ask
// <the other spymaster>", as the rulebook has it. Without (Duet: no one to
// ask), every clash is refused.

/** Putting a spelling-only clash to the opposing spymaster. */
export interface ClueAsk {
  /** Who rules, as the button names them ("Blue"). */
  judge: string;
  onAsk: (word: string, count: ClueCount) => void;
  /** The word the judge just refused this turn, to say why the composer is back. */
  refused?: string | null;
}

/** Duet's rule: any clash is refused, spelling included. */
function strictVerdict(
  word: string,
  faceDownWords: readonly string[],
  language: Language,
): ClueVerdict {
  const problem = clueProblem(word, faceDownWords, language);
  return problem === null ? { kind: "ok" } : { kind: "hard", message: problem };
}

export function ClueComposer({
  faceDownWords,
  language,
  chosenWords,
  onSubmit,
  showUnlimited = true,
  ask,
}: {
  faceDownWords: readonly string[];
  language: Language;
  /** The cards tapped as this clue's targets, in tap order. */
  chosenWords: readonly string[];
  onSubmit: (word: string, count: ClueCount) => void;
  /** Duet's number is only information, so ∞ adds nothing there. */
  showUnlimited?: boolean;
  ask?: ClueAsk;
}) {
  const [word, setWord] = useState("");
  const [count, setCount] = useState<ClueCount>(1);
  const [countSetByHand, setCountSetByHand] = useState(false);
  const verdict: ClueVerdict | null = !word.trim()
    ? null
    : ask
      ? clueVerdict(word, faceDownWords, language)
      : strictVerdict(word, faceDownWords, language);
  const problem = verdict?.kind === "hard" ? verdict.message : null;
  const asking = verdict?.kind === "soft" && ask !== undefined;

  useEffect(() => {
    if (!countSetByHand && chosenWords.length > 0) {
      setCount(Math.min(MAX_CLUE_COUNT, chosenWords.length));
    }
  }, [chosenWords.length, countSetByHand]);

  const step = (delta: 1 | -1) => {
    setCountSetByHand(true);
    setCount((c) => {
      const n = c === "unlimited" ? MAX_CLUE_COUNT + 1 : c;
      const next = n + delta;
      if (next > MAX_CLUE_COUNT) return showUnlimited ? "unlimited" : MAX_CLUE_COUNT;
      return Math.max(0, next);
    });
  };

  const hint = problem ? (
    <span className="text-amber-300">{problem}</span>
  ) : asking && verdict?.kind === "soft" ? (
    <span className="text-amber-200">
      {verdict.message} The rulebook lets {ask?.judge} allow it — ask quietly.
    </span>
  ) : ask?.refused && !word.trim() ? (
    <span className="text-amber-300">
      {ask.judge} refused {ask.refused.toUpperCase()} — think of another word.
    </span>
  ) : chosenWords.length > 0 ? (
    <span>
      Meant: <span className="font-semibold text-fg-primary">{chosenWords.join(" · ")}</span>
      <span className="text-fg-muted"> — only you see this until the end</span>
    </span>
  ) : (
    <span className="text-fg-muted">Tap your agents on the board to mark what you mean</span>
  );

  return (
    <form
      className="flex w-[34rem] max-w-full flex-col items-center gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (!word.trim() || problem) return;
        if (asking) ask?.onAsk(word.trim(), count);
        else onSubmit(word.trim(), count);
        setWord("");
        setCountSetByHand(false);
      }}
    >
      <div className="flex w-full items-center gap-2">
        <Input
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="One-word clue"
          maxLength={MAX_CLUE_LENGTH}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          aria-label="Clue word"
          className="min-w-0 flex-1 font-black uppercase tracking-pill"
        />
        <div className="flex shrink-0 items-center rounded-ui-md border border-line bg-fill-soft">
          <IconButton
            size="sm"
            icon={<MinusIcon />}
            aria-label="Fewer words"
            disabled={count === 0}
            onClick={() => step(-1)}
          />
          <span
            className={cn(
              "w-7 text-center text-lg font-black tabular-nums",
              count === "unlimited" ? "text-accent-300" : "text-fg-strong",
            )}
            aria-live="polite"
            title={
              count === "unlimited"
                ? "∞: as many guesses as they like"
                : count === 0
                  ? "0: none of ours fit this word"
                  : `${count} word${count === 1 ? "" : "s"}`
            }
          >
            {formatClueCount(count)}
          </span>
          <IconButton
            size="sm"
            icon={<PlusIcon />}
            aria-label="More words"
            disabled={count === (showUnlimited ? "unlimited" : MAX_CLUE_COUNT)}
            onClick={() => step(1)}
          />
        </div>
        <Button
          type="submit"
          variant={asking ? "secondary" : "primary"}
          disabled={!word.trim() || problem !== null}
        >
          {asking ? `Ask ${ask?.judge}` : "Give clue"}
        </Button>
      </div>
      <p className="w-full truncate text-center text-3xs text-fg-secondary">{hint}</p>
    </form>
  );
}
