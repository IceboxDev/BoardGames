import {
  sortWedges,
  TRIVIAL_PURSUIT_WEDGES,
  type Wedge,
} from "@boardgames/core/history/trivial-pursuit";
import { cn } from "../../../lib/cn";
import { WEDGE_STYLE, WedgePie } from "../WedgePie";

type Props = {
  wedges: readonly Wedge[];
  onChange: (next: Wedge[]) => void;
  /** Whose pie this is — names the toggles for screen readers. */
  owner: string;
};

/**
 * One toggle per pie wedge, in board order: a filled dot once collected, a
 * hollow ring in the wedge's colour until then. The live pie at the end reads
 * back the whole set at a glance.
 */
export function WedgePicker({ wedges, onChange, owner }: Props) {
  const held = new Set(wedges);
  function toggle(w: Wedge) {
    const next = new Set(held);
    if (next.has(w)) next.delete(w);
    else next.add(w);
    onChange(sortWedges([...next]));
  }
  return (
    <div className="flex items-center gap-1.5">
      {TRIVIAL_PURSUIT_WEDGES.map((w) => {
        const on = held.has(w);
        const style = WEDGE_STYLE[w];
        return (
          // biome-ignore lint/correctness/noRestrictedElements: a coloured wedge token, a game piece rather than a labelled chip.
          <button
            key={w}
            type="button"
            aria-pressed={on}
            aria-label={`${owner}: ${style.name} wedge`}
            title={`${style.name} wedge`}
            onClick={() => toggle(w)}
            className={cn(
              "h-6 w-6 rounded-full border-2 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-fg-strong/40",
              style.border,
              on ? style.bg : "bg-transparent opacity-60 hover:opacity-100",
            )}
          />
        );
      })}
      <WedgePie wedges={wedges} className="ml-1 h-6 w-6" />
    </div>
  );
}
