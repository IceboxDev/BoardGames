import { useState } from "react";
import { getCompendiumEntry } from "../logic/compendium";

// A hoverable term on the character sheet (weapon, armor, tool, language…):
// dotted underline, and on hover/focus an overlay card with the compendium
// entry. Entries come from the mock compendium for now; the lookup point is
// what matters — a real item database slots in behind `getCompendiumEntry`.

const SERIF = { fontFamily: "ui-serif, Georgia, serif" } as const;

type Props = {
  term: string;
};

export function HoverTerm({ term }: Props) {
  const [open, setOpen] = useState(false);
  const entry = getCompendiumEntry(term);

  return (
    <span className="relative inline-block">
      {/* biome-ignore lint/correctness/noRestrictedElements: inline dotted-underline term inside running text — Button/Chip chrome cannot sit mid-sentence. */}
      <button
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((v) => !v)}
        className={`cursor-help rounded-sm text-left underline decoration-dotted underline-offset-2 outline-none focus-visible:ring-1 focus-visible:ring-amber-400/60 ${
          entry ? "decoration-amber-400/60" : "decoration-amber-400/25"
        }`}
      >
        {term}
      </button>
      {open && (
        <span className="absolute bottom-full left-1/2 z-overlay w-64 -translate-x-1/2 pb-1.5">
          <span className="block rounded-xl border border-amber-400/30 bg-[#1a0606] p-3 shadow-2xl shadow-black/70">
            {entry ? (
              <>
                <span className="font-fantasy block text-sm font-bold text-amber-100">
                  {entry.title}
                </span>
                <span className="block text-3xs font-semibold uppercase tracking-[0.14em] text-amber-300/60">
                  {entry.kind}
                </span>
                <span
                  className="mt-1.5 block text-xs leading-relaxed text-amber-200/75"
                  style={SERIF}
                >
                  {entry.text}
                </span>
              </>
            ) : (
              <span className="block text-xs leading-relaxed text-amber-200/50" style={SERIF}>
                No compendium entry for "{term}" yet — the item archive is still being inscribed.
              </span>
            )}
          </span>
        </span>
      )}
    </span>
  );
}
