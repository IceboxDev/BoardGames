import { formatClueCount } from "@boardgames/core/games/codenames/clue-rules";
import { Button, Chip, MicroLabel } from "../../../components/ui";
import { cn } from "../../../lib/cn";
import { TEAM_BG, TEAM_TEXT, teamName } from "../logic/labels";
import type { TeamClue, TeamScore } from "../logic/table";

// The strip between the turn header and the board — one fixed height for the
// viewer's whole game, so the board below never moves.
//
// Left: the viewer's team's clues, oldest first.
//   - Operatives ("pin"): tap a clue to arm it, then tap cards to pin it on
//     them as a sticky note — CSI-style working-out the team's operatives see,
//     on any turn. Tap it again, Done, or Esc to stop.
//   - Spymasters ("owed"): each clue says how many of the cards it meant are
//     still face down; tap one to outline those cards on the board — what
//     the team's extra (+1) guess could still be spent on.
//   - Spectators: no clues, only the score.
// Right, below the wide layout (where the Teams rail is a sheet away): the
// score — the race that decides whether to take the extra guess or stop.

export type ClueStripMode = "pin" | "owed" | "watch";

function ClueChip({
  clue,
  mode,
  selected,
  enabled,
  onSelect,
}: {
  clue: TeamClue;
  mode: ClueStripMode;
  selected: boolean;
  enabled: boolean;
  onSelect: () => void;
}) {
  const word = clue.word.toUpperCase();
  const count = formatClueCount(clue.count);
  const owed = clue.owed;
  const title =
    mode === "pin"
      ? `${word} ${count}: ${clue.found} found on its turn${clue.pinned > 0 ? `, pinned on ${clue.pinned} card${clue.pinned === 1 ? "" : "s"}` : ""} — tap, then tap cards to pin it`
      : owed === null
        ? `${word} ${count}: you didn't mark what it meant`
        : owed.length === 0
          ? `${word} ${count}: everything it meant is found`
          : `${word} ${count}: ${owed.length} of the cards it meant still face down — tap to see them`;
  return (
    <Chip
      size="xs"
      tone="amber"
      pressed={selected}
      disabled={!enabled || (mode === "owed" && (owed === null || owed.length === 0))}
      onClick={onSelect}
      title={title}
      className="shrink-0 font-black uppercase tracking-pill"
    >
      {clue.word}
      <span className="tabular-nums text-fg-muted">{count}</span>
      {mode === "pin" && clue.found > 0 && (
        <span className="tabular-nums text-emerald-300">{clue.found}✓</span>
      )}
      {mode === "owed" && owed !== null && owed.length > 0 && (
        <span className="rounded-full bg-cn-note px-1 tabular-nums text-cn-note-ink">
          {owed.length}
        </span>
      )}
    </Chip>
  );
}

function ScorePills({ score }: { score: readonly TeamScore[] }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 lg:hidden">
      <span className="sr-only">Agents left to find:</span>
      {score.map((s) => (
        <span
          key={s.team}
          title={`${teamName(s.team)}: ${s.left} of ${s.total} agents still to find`}
          className={cn(
            "flex h-6 items-center gap-1.5 rounded-full bg-fill px-2 text-3xs font-black uppercase tracking-pill",
            s.active ? "ring-1 ring-fg-strong/40" : "opacity-80",
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", TEAM_BG[s.team])} aria-hidden />
          <span className={TEAM_TEXT[s.team]}>{teamName(s.team)}</span>
          <span className="text-xs tabular-nums text-fg-strong">{s.left}</span>
        </span>
      ))}
    </div>
  );
}

export function ClueStrip({
  mode,
  clues,
  selected,
  onSelect,
  enabled,
  score,
  owedWords,
}: {
  mode: ClueStripMode;
  clues: readonly TeamClue[];
  /** The armed (pin) or opened (owed) clue's turn, or null. */
  selected: number | null;
  onSelect: (turn: number | null) => void;
  enabled: boolean;
  score: readonly TeamScore[];
  /** Owed mode: the opened clue's face-down targets, as words. */
  owedWords?: readonly string[];
}) {
  const open = clues.find((c) => c.turn === selected);
  const label =
    mode === "pin"
      ? open
        ? `Tap cards for ${open.word.toUpperCase()}`
        : "Our clues"
      : mode === "owed"
        ? "Our clues"
        : null;
  const empty =
    mode === "pin"
      ? "Your spymaster's clues land here — pin each to the cards you think it meant."
      : "Your clues land here — tap one later to see what it still owes.";

  return (
    <div
      className={cn(
        "flex h-9 shrink-0 items-center gap-2 px-1",
        // A spectator's strip is only the score: on the wide layout the Teams rail has it.
        mode === "watch" && "lg:hidden",
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto pr-4 [mask-image:linear-gradient(to_right,black_calc(100%-1rem),transparent)]">
        {label && (
          // On a phone the chips need the room — unless the label is the instruction.
          <MicroLabel className={cn("shrink-0", !(mode === "pin" && open) && "hidden sm:inline")}>
            {label}
          </MicroLabel>
        )}
        {mode !== "watch" && clues.length === 0 && (
          <span className="truncate text-3xs text-fg-muted">{empty}</span>
        )}
        {mode !== "watch" &&
          clues.map((clue) => (
            <ClueChip
              key={clue.turn}
              clue={clue}
              mode={mode}
              selected={clue.turn === selected}
              enabled={enabled}
              onSelect={() => onSelect(clue.turn === selected ? null : clue.turn)}
            />
          ))}
        {mode === "owed" && open && owedWords && owedWords.length > 0 && (
          <span className="shrink-0 text-3xs text-fg-secondary">
            still owes{" "}
            <span className="font-black uppercase tracking-pill text-fg-strong">
              {owedWords.join(" · ")}
            </span>
          </span>
        )}
        {mode === "pin" && open && (
          <Button size="xs" variant="ghost" onClick={() => onSelect(null)} className="shrink-0">
            Done
          </Button>
        )}
      </div>
      <ScorePills score={score} />
    </div>
  );
}
