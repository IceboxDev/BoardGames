import type { CSSProperties, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { SelectableCard } from "../ui/SelectableCard";
import { DIFFICULTY, type DifficultyTier } from "./difficulty";

// ── One row of choice cards ─────────────────────────────────────────────
//
// The briefing's main choice — the AI level, or a co-op game's difficulty —
// as one row of equal cards, however many there are (the row divides the
// width evenly; a phone stacks them). Each card: a small file line, the
// name, a description clamped to three lines (the height is reserved, so
// every card in the row is the same size whichever is chosen), and a tier
// line in the tier's colour. The chosen card carries a corner stamp.
//
// Built on SelectableCard's `stripe` chrome: the stripe is the tier colour.

export interface SetupChoice {
  id: string;
  label: ReactNode;
  description?: ReactNode;
  /** Colours the stripe and names the tier on the card's last line. */
  tier?: DifficultyTier;
  /** Replaces the tier line (e.g. Pandemic's epidemic count). */
  meta?: ReactNode;
}

export interface SetupChoiceCardsProps {
  /** Accessible name of the group ("AI level"). */
  label: string;
  choices: readonly SetupChoice[];
  value: string;
  onChange: (id: string) => void;
  /** The word in front of each card's number ("Level 01"). */
  fileWord?: string;
  /** The chosen card's stamp. */
  stamp?: string;
}

export function SetupChoiceCards({
  label,
  choices,
  value,
  onChange,
  fileWord = "Level",
  stamp = "Chosen",
}: SetupChoiceCardsProps) {
  const dense = choices.length > 4;
  const style = { "--setup-cols": choices.length } as CSSProperties;
  return (
    <fieldset
      aria-label={label}
      style={style}
      className="m-0 grid min-w-0 grid-cols-1 gap-2 border-0 p-0 sm:grid-cols-[repeat(var(--setup-cols),minmax(0,1fr))] sm:gap-3"
    >
      {choices.map((choice, index) => {
        const selected = choice.id === value;
        const tier = choice.tier ? DIFFICULTY[choice.tier] : null;
        return (
          <SelectableCard
            key={choice.id}
            variant="stripe"
            accentColor={tier?.accentColor}
            padding="sm"
            selected={selected}
            onClick={() => onChange(choice.id)}
            className="min-w-0 text-left"
          >
            <span className="contents">
              {selected && (
                <span
                  aria-hidden="true"
                  className="absolute -right-9 top-3 rotate-[32deg] bg-accent-500 px-10 py-0.5 text-3xs font-bold uppercase tracking-label text-on-accent"
                >
                  {stamp}
                </span>
              )}
              <span className="text-3xs uppercase tracking-label text-fg-muted">
                {fileWord} {String(index + 1).padStart(2, "0")}
              </span>
              <span
                className={cn(
                  "mt-0.5 block truncate font-bold tracking-tight text-fg-strong",
                  dense ? "text-sm sm:text-base" : "text-base sm:text-lg",
                )}
              >
                {choice.label}
              </span>
              {choice.description && (
                <span
                  className={cn(
                    "mt-1 text-fg-secondary",
                    dense
                      ? "line-clamp-3 min-h-[3.75em] text-xs leading-snug"
                      : "line-clamp-2 min-h-[2.9em] text-sm leading-snug sm:line-clamp-3 sm:min-h-[4.35em]",
                    !selected && "max-sm:hidden",
                  )}
                >
                  {choice.description}
                </span>
              )}
              <span className="mt-2 block text-3xs font-semibold uppercase tracking-label">
                {choice.meta ??
                  (tier && choice.tier ? (
                    <span style={{ color: tier.accentColor }}>{choice.tier}</span>
                  ) : null)}
              </span>
            </span>
          </SelectableCard>
        );
      })}
    </fieldset>
  );
}
