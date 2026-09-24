import type { PenaltySeverity } from "@boardgames/core/games/quiztopia/types";
import { Chip, Kbd, MicroLabel } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";

// Expert mode's tip cards, lying in the middle of the table: face-up "TIPP"
// cards are the tips the table may still buy, face-down ones are spent. A
// non-active seat flips one to give a tip; the second flip in a turn opens
// the Plenum. The penalty chips are pressed by whoever owns up (accidental
// tip = one card, blurted answer = two).

type Props = {
  tipCards: { total: number; active: number };
  tipFlips: number;
  canFlip: boolean;
  onFlip: () => void;
  canPenalty: boolean;
  onPenalty: (severity: PenaltySeverity) => void;
};

export default function TipCardRow({
  tipCards,
  tipFlips,
  canFlip,
  onFlip,
  canPenalty,
  onPenalty,
}: Props) {
  const { total, active } = tipCards;
  const slots = Array.from({ length: total }, (_, i) => i);
  return (
    <section
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card-lg border border-line-soft bg-surface-900/40 px-3 py-2"
      aria-label="Tip cards"
    >
      <div className="flex items-center gap-2">
        <MicroLabel className="font-semibold">Tip cards</MicroLabel>
        <span className="text-xs tabular-nums text-fg-secondary">
          <span className="font-semibold text-fg-strong">{active}</span> / {total} active
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        {slots.map((slot) => {
          const faceUp = slot < active;
          const clickable = faceUp && canFlip;
          const face = cn(
            "flex h-12 w-9 items-center justify-center rounded-ui-md border text-3xs font-bold uppercase tracking-pill transition-all",
            faceUp
              ? "border-amber-400/50 bg-amber-400/15 text-amber-200 shadow-glow-amber"
              : "border-line bg-surface-800 text-fg-disabled",
            clickable && "cursor-pointer hover:-translate-y-0.5 hover:bg-amber-400/25",
          );
          if (clickable) {
            return (
              // biome-ignore lint/correctness/noRestrictedElements: a tip card is a game piece the table flips; Button's chrome would break the card face.
              <button
                key={`tip-${slot}`}
                type="button"
                onClick={onFlip}
                aria-label="Flip a tip card to give a tip"
                className={cn(
                  face,
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-fg-strong/60",
                )}
              >
                TIPP
              </button>
            );
          }
          return (
            <span
              key={`tip-${slot}`}
              role="img"
              aria-label={faceUp ? "Tip card, active" : "Tip card, used"}
              className={face}
            >
              {faceUp ? "TIPP" : ""}
            </span>
          );
        })}
      </div>
      {canFlip && (
        <span className="flex items-center gap-1 text-2xs text-fg-muted">
          Flip to give a tip <Kbd>T</Kbd>
        </span>
      )}
      {tipFlips > 0 && (
        <span className="text-2xs text-fg-muted">
          {tipFlips === 1 ? "1 flipped this turn" : `${tipFlips} flipped this turn`}
        </span>
      )}
      {canPenalty && (
        <div className="ml-auto flex items-center gap-1.5">
          <Chip
            pressed={false}
            tone="rose"
            variant="outlined"
            size="xs"
            title="Someone let a tip slip: one tip card goes face-down"
            onClick={() => onPenalty("tip")}
          >
            Accidental tip
          </Chip>
          <Chip
            pressed={false}
            tone="rose"
            variant="outlined"
            size="xs"
            title="Someone blurted the answer: two tip cards go face-down"
            onClick={() => onPenalty("answer")}
          >
            Blurted answer
          </Chip>
        </div>
      )}
    </section>
  );
}
