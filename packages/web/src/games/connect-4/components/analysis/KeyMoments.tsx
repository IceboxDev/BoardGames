import { MicroLabel } from "../../../../components/ui";
import { cn } from "../../../../lib/cn";
import type { KeyMoment, Outcome } from "../../logic/analysis-model";
import { CHANGE_LABEL, outcomeText, seatName } from "../../logic/text";
import { seatInk } from "../board/palette";
import { DiscGlyph, EvalChip } from "./EvalChip";
import { GRADES } from "./grades";

interface Props {
  moments: readonly KeyMoment[];
  /** The game's start, for "it never changed hands". */
  start: Outcome;
  names: readonly string[];
  ply: number;
  onSelect: (ply: number) => void;
  /** Every move is graded (until then the list can still grow). */
  done: boolean;
}

/** Every move that changed the result, the decisive one marked — the game's story in a few lines. */
export function KeyMoments({ moments, start, names, ply, onSelect, done }: Props) {
  return (
    <section className="flex min-w-0 flex-col gap-1.5" aria-label="Turning points">
      <MicroLabel>Turning points</MicroLabel>
      {moments.length === 0 ? (
        <p className="text-xs text-fg-muted">
          {done
            ? `The result never changed hands. ${outcomeText(start, names)}.`
            : "Looking for the moments the result changed…"}
        </p>
      ) : (
        <ol className="flex flex-col">
          {moments.map(({ story, decisive }) => {
            const selected = ply === story.index + 1;
            return (
              <li key={story.index}>
                {/* biome-ignore lint/correctness/noRestrictedElements: a full-width row that selects a move. */}
                <button
                  type="button"
                  onClick={() => onSelect(story.index + 1)}
                  aria-current={selected ? "step" : undefined}
                  className={cn(
                    "grid w-full min-w-0 grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-ui-md px-1.5 py-1 text-left text-xs",
                    selected ? "bg-fill-strong" : "hover:bg-fill",
                  )}
                >
                  <span className="font-mono tabular-nums text-fg-muted">{story.index + 1}</span>
                  <span className="flex min-w-0 items-center gap-1.5 text-fg-secondary">
                    <span style={{ color: seatInk(story.player) }}>
                      <DiscGlyph seat={story.player} />
                    </span>
                    <span className="truncate">
                      {seatName(story.player, names)} · column {story.column + 1}
                    </span>
                    {decisive && (
                      <span className="shrink-0 text-2xs font-medium uppercase tracking-label text-accent-300">
                        decisive
                      </span>
                    )}
                  </span>
                  <span className={cn("font-medium", GRADES[story.grade].ink)}>
                    {CHANGE_LABEL[story.change]}
                  </span>
                  <EvalChip outcome={story.after} names={names} />
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
