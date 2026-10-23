/**
 * The board view's own controls, quiet icons at the header's right: walk the
 * line (⏮ ◀ ▶ ⏭, also ← / →) and turn the board around (also F). And the
 * one decision the board asks of you, as a card at the foot of the analysis
 * rail: when the move just played isn't your tree's, make it yours; where you
 * chose the move yourself, hand it back to the engine.
 */
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
} from "../../../../components/icons";
import { Button, IconButton } from "../../../../components/ui";

export function BoardTools({
  ply,
  length,
  onGoTo,
  onFlip,
}: {
  ply: number;
  length: number;
  onGoTo: (ply: number) => void;
  onFlip: () => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <IconButton
        icon={<ChevronsLeftIcon className="size-4" />}
        aria-label="Start of the line"
        variant="ghost"
        size="sm"
        disabled={ply === 0}
        onClick={() => onGoTo(0)}
      />
      <IconButton
        icon={<ChevronLeftIcon className="size-4" />}
        aria-label="Back a move (←)"
        variant="ghost"
        size="sm"
        disabled={ply === 0}
        onClick={() => onGoTo(ply - 1)}
      />
      <IconButton
        icon={<ChevronRightIcon className="size-4" />}
        aria-label="Forward a move (→)"
        variant="ghost"
        size="sm"
        disabled={ply >= length}
        onClick={() => onGoTo(ply + 1)}
      />
      <IconButton
        icon={<ChevronsRightIcon className="size-4" />}
        aria-label="End of the line"
        variant="ghost"
        size="sm"
        disabled={ply >= length}
        onClick={() => onGoTo(length)}
      />
      <span aria-hidden="true" className="mx-1 h-4 w-px bg-line" />
      <Button variant="ghost" size="sm" onClick={onFlip} title="Turn the board around (F)">
        ⇅ Flip
      </Button>
    </div>
  );
}

export function ChoiceCard({
  makeMine,
  engineBest,
  busy,
}: {
  /** "Make {san} my move", when the last move was yours and not the tree's. */
  makeMine: { san: string; run: () => void } | null;
  /** "Engine's best here", when you chose this position's move yourself. */
  engineBest: (() => void) | null;
  busy: boolean;
}) {
  if (!makeMine && !engineBest) return null;
  return (
    <div className="flex shrink-0 flex-col gap-2 rounded-card-md bg-amber-400/10 p-3 ring-1 ring-amber-300/25">
      <p className="m-0 text-fg-secondary text-xs leading-relaxed">
        {makeMine
          ? `${makeMine.san} isn't your tree's move here. Make it yours and the tree regrows from this position.`
          : "You chose this move yourself. The engine can choose it again; the tree regrows from here."}
      </p>
      <div className="flex flex-wrap gap-2">
        {makeMine && (
          <Button size="sm" variant="tinted" tone="amber" onClick={makeMine.run} disabled={busy}>
            ★ Make {makeMine.san} my move
          </Button>
        )}
        {engineBest && (
          <Button size="sm" variant="secondary" onClick={engineBest} disabled={busy}>
            ↺ Engine's best here
          </Button>
        )}
      </div>
    </div>
  );
}
