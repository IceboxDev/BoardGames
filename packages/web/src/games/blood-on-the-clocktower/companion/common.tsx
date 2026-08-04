// Shared bits for the Storyteller companion screens. Phone-first: the DM runs
// this on a handset at the table, so hit targets are large, layouts are
// single-column by default, and everything lives inside one scroll container.

import type { CharacterId } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import { CHARACTERS } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type {
  CompanionPlayer,
  CompanionState,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import type { ReactNode } from "react";
import { Chip } from "../../../components/ui";
import { TYPE_TEXT, trueCharacterLabel } from "./labels";

/** Scroll container + backdrop, following the D&D tool's screen-owns-scroll pattern. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="relative z-10 h-full overflow-y-auto bg-gradient-to-b from-rose-950/25 via-surface-950 to-black">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 py-4 pb-24 sm:px-4 sm:py-6">
        {children}
      </div>
    </div>
  );
}

export function Panel({
  title,
  tone = "neutral",
  children,
  className = "",
}: {
  title?: ReactNode;
  tone?: "neutral" | "night" | "day" | "danger" | "gold";
  children: ReactNode;
  className?: string;
}) {
  const toneClass = {
    neutral: "border-white/10 bg-surface-900/70",
    night: "border-accent-400/25 bg-accent-500/10",
    day: "border-amber-300/25 bg-amber-950/25",
    danger: "border-rose-400/35 bg-rose-950/40",
    gold: "border-amber-300/40 bg-amber-400/10",
  }[tone];
  return (
    <section className={`rounded-xl border p-3 sm:p-4 ${toneClass} ${className}`}>
      {title && (
        <h3 className="mb-2 text-xs font-bold uppercase tracking-label text-fg-secondary">
          {title}
        </h3>
      )}
      {children}
    </section>
  );
}

export function CharacterTag({ character }: { character: CharacterId }) {
  const c = CHARACTERS[character];
  return <span className={`font-semibold ${TYPE_TEXT[c.type]}`}>{c.name}</span>;
}

/**
 * Tappable seat grid — the companion's main input surface. Phone-first: two
 * columns of large chips so a thumb can hit them while holding the Grimoire.
 */
export function SeatPicker({
  state,
  selected,
  onToggle,
  disabledSeats = [],
  deadSelectable = false,
  showCharacters = false,
}: {
  state: CompanionState;
  selected: number[];
  onToggle: (seat: number) => void;
  disabledSeats?: number[];
  /** Allow tapping dead players (e.g. nominating the dead is legal). */
  deadSelectable?: boolean;
  /** Storyteller view: show each seat's true character under the name. */
  showCharacters?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {state.players.map((p) => {
        const disabled = disabledSeats.includes(p.seat) || (!p.alive && !deadSelectable);
        return (
          <Chip
            key={p.seat}
            pressed={selected.includes(p.seat)}
            tone="rose"
            size="md"
            block
            disabled={disabled}
            onClick={() => onToggle(p.seat)}
            className="min-h-11 justify-start"
          >
            <span className="flex min-w-0 flex-col items-start text-left">
              <span className={`max-w-full truncate ${p.alive ? "" : "line-through opacity-60"}`}>
                {p.name}
              </span>
              {showCharacters && (
                <span className="max-w-full truncate text-3xs font-normal opacity-70">
                  {trueCharacterLabel(p)}
                </span>
              )}
            </span>
          </Chip>
        );
      })}
    </div>
  );
}

/** Compact status chips shown next to a player everywhere in the tool. */
export function StatusChips({ p }: { p: CompanionPlayer }) {
  const chips: { label: string; cls: string }[] = [];
  if (!p.alive) {
    chips.push({
      label: p.ghostVote ? "Dead · ghost vote" : "Dead · no vote",
      cls: "bg-white/10 text-fg-secondary",
    });
  }
  if (p.poisoned) chips.push({ label: "Poisoned", cls: "bg-emerald-400/15 text-emerald-300" });
  if (p.protectedTonight) chips.push({ label: "Protected", cls: "bg-sky-400/15 text-sky-300" });
  if (p.redHerring) chips.push({ label: "Red herring", cls: "bg-rose-400/15 text-rose-300" });
  if (p.usedAbility) chips.push({ label: "Ability spent", cls: "bg-amber-400/15 text-amber-300" });
  if (chips.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {chips.map((c) => (
        <span
          key={c.label}
          className={`rounded px-1.5 py-0.5 text-3xs font-bold uppercase tracking-pill ${c.cls}`}
        >
          {c.label}
        </span>
      ))}
    </span>
  );
}
