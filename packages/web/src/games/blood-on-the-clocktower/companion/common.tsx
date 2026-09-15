// Shared bits for the Storyteller companion screens. Phone-first: the DM runs
// this on a handset at the table, so hit targets are large, layouts are
// single-column by default, and everything lives inside one scroll container.
// Chrome primitives (Panel, Hint, CharacterChip…) live in ./ui.

import { CHARACTERS } from "@boardgames/core/games/blood-on-the-clocktower/characters";
import type {
  CompanionPlayer,
  CompanionState,
} from "@boardgames/core/games/blood-on-the-clocktower/companion";
import type { ReactNode } from "react";
import { Badge, Chip } from "../../../components/ui";
import type { Tone } from "../../../components/ui/tones";
import { cn } from "../../../lib/cn";
import { trueCharacterLabel } from "./labels";
import { useHandOver } from "./privacy-context";
import { CharacterIcon } from "./ui";

export { CharacterIcon, CharacterTag, Panel } from "./ui";

/** Scroll container + backdrop, following the D&D tool's screen-owns-scroll pattern. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="relative z-raised h-full overflow-y-auto bg-gradient-to-b from-rose-950/25 via-surface-950 to-black">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-3 py-4 pb-24 sm:px-4 sm:py-6">
        {children}
      </div>
    </div>
  );
}

/**
 * Tappable seat grid — the companion's main input surface. Phone-first: two
 * columns of large chips so a thumb can hit them while holding the Grimoire.
 * Every chip carries the player's token art (the Storyteller's cheat sheet
 * for a table of half-remembered names); in hand-over mode it is names only.
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
  const handOver = useHandOver();
  return (
    <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
      {state.players.map((p) => {
        // Travellers who left town are gone entirely — never pickable.
        if (p.left) return null;
        // Players who died THIS night are not yet announced — the town still
        // believes they are alive, so night choices (the Butler picking a
        // master after the Imp killed someone) must be able to target them.
        const disabled =
          disabledSeats.includes(p.seat) || (!p.alive && !p.diedTonight && !deadSelectable);
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
            <span className="flex min-w-0 items-center gap-1.5 text-left">
              {!handOver && (
                <CharacterIcon
                  character={p.character}
                  size="sm"
                  decorative
                  className={p.alive ? "" : "opacity-40 saturate-50"}
                />
              )}
              <span className="flex min-w-0 flex-col items-start">
                <span className={cn("max-w-full truncate", !p.alive && "line-through opacity-60")}>
                  {p.name}
                </span>
                {showCharacters && !handOver && (
                  <span className="max-w-full truncate text-3xs font-normal opacity-70">
                    {trueCharacterLabel(p)}
                  </span>
                )}
              </span>
            </span>
          </Chip>
        );
      })}
    </div>
  );
}

/** A player's status marks, in the hue of what they mean (see `Hint`). */
function statusMarks(p: CompanionPlayer): Array<{ label: string; tone: Tone }> {
  const marks: Array<{ label: string; tone: Tone }> = [];
  if (p.left) {
    marks.push({ label: "Left town", tone: "neutral" });
  } else if (!p.alive) {
    marks.push({ label: p.ghostVote ? "Dead · ghost vote" : "Dead · no vote", tone: "neutral" });
  }
  if (p.tripleVote) marks.push({ label: "×3 vote", tone: "purple" });
  if (p.negativeVote) marks.push({ label: "−1 vote", tone: "purple" });
  if (p.beggarTokens) {
    marks.push({
      label: `${p.beggarTokens} token${p.beggarTokens === 1 ? "" : "s"}`,
      tone: "purple",
    });
  }
  if (p.poisoned) marks.push({ label: "Poisoned", tone: "emerald" });
  if (p.protectedTonight) marks.push({ label: "Protected", tone: "sky" });
  if (p.redHerring) marks.push({ label: "Red herring", tone: "rose" });
  if (p.usedAbility) marks.push({ label: "Ability spent", tone: "amber" });
  if ((p.drunkNights ?? 0) > 0) {
    const source = p.drunkSource ? ` (${CHARACTERS[p.drunkSource].name})` : "";
    const nights = (p.drunkNights ?? 0) > 1 ? ` ·${p.drunkNights}` : "";
    marks.push({ label: `Drunk${source}${nights}`, tone: "emerald" });
  }
  if (p.safeTonight) marks.push({ label: "Safe tonight", tone: "sky" });
  if (p.survivesExecution) marks.push({ label: "Survives execution", tone: "sky" });
  if (p.registersDead) marks.push({ label: "UNDEAD — secretly alive", tone: "rose" });
  return marks;
}

/** Compact status pills shown next to a player everywhere in the tool. */
export function StatusChips({ p }: { p: CompanionPlayer }) {
  const marks = statusMarks(p);
  if (marks.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {marks.map((m) => (
        <Badge key={m.label} tone={m.tone}>
          {m.label}
        </Badge>
      ))}
    </span>
  );
}
