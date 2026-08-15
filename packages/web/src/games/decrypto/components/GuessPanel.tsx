import type {
  Code,
  Digit,
  DraftCode,
  GuessPurpose,
  TransmissionView,
} from "@boardgames/core/games/decrypto/types";
import { Button, Chip, Surface } from "../../../components/ui";
import { cn } from "../../../lib/cn";

// The ordered three-slot guess builder. The draft is SHARED team state (every
// edit goes through the machine as a `set-draft` action and syncs to
// teammates); Submit commits the completed code for the whole team.

const DIGITS: Digit[] = [1, 2, 3, 4];

function draftComplete(draft: DraftCode): draft is Code {
  return draft.every((d) => d !== null) && new Set(draft).size === 3;
}

export function GuessPanel({
  tx,
  purpose,
  onDraft,
  onSubmit,
}: {
  tx: TransmissionView;
  purpose: GuessPurpose;
  onDraft: (purpose: GuessPurpose, slot: 0 | 1 | 2, digit: Digit | null) => void;
  onSubmit: (purpose: GuessPurpose, code: Code) => void;
}) {
  const draft = tx.myDraft ?? [null, null, null];
  const clues = tx.clues;
  if (!clues) return null;
  const complete = draftComplete(draft);

  return (
    <Surface variant="raised" padding="md" className="mx-auto w-full max-w-xl">
      <p className="mb-3 text-center text-2xs font-semibold uppercase tracking-label text-fg-muted">
        {purpose === "decode" ? "Decode your team's transmission" : "Intercept the enemy code"}
      </p>

      <div className="flex flex-col gap-2.5">
        {clues.map((clue, slot) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: guess slots are positional
          <div key={slot} className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
            <span
              className="min-w-0 truncate text-center text-sm font-semibold text-white sm:flex-1 sm:text-right"
              title={clue}
            >
              “{clue}”
            </span>
            <div className="flex shrink-0 justify-center gap-1.5 sm:justify-end sm:gap-1">
              {DIGITS.map((digit) => {
                const selected = draft[slot] === digit;
                const usedElsewhere = !selected && draft.includes(digit);
                return (
                  <Chip
                    key={digit}
                    pressed={selected}
                    tone="accent"
                    size="sm"
                    onClick={() => onDraft(purpose, slot as 0 | 1 | 2, selected ? null : digit)}
                    className={cn(
                      // Bigger tap targets on touch-first widths.
                      "h-10 w-10 justify-center px-0 text-sm font-bold sm:h-8 sm:w-8",
                      usedElsewhere && "opacity-40",
                    )}
                  >
                    {digit}
                  </Chip>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex justify-center">
        <Button
          variant="primary"
          disabled={!complete}
          onClick={() => {
            if (draftComplete(draft)) onSubmit(purpose, [...draft] as Code);
          }}
        >
          {purpose === "decode" ? "Commit answer" : "Commit interception"}
        </Button>
      </div>
      <p className="mt-1.5 text-center text-3xs text-fg-muted">
        Drafts sync with your teammates; the commit locks your team's answer.
      </p>
    </Surface>
  );
}
