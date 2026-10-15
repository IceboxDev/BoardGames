import { formatClueCount } from "@boardgames/core/games/codenames/clue-rules";
import type { KeyEntry, TurnEnd } from "@boardgames/core/games/codenames/types";
import { cn } from "../../../lib/cn";
import { TEAM_TEXT, teamName } from "../logic/labels";
import type { LastTurn } from "../logic/table";

// The last turn in one line, under "… is thinking of a clue": who played,
// their clue, and each touch with how it went — so a player who looked away
// (or just joined the tab) knows what changed without opening the History.
// The board's numbered badges show the same touches where they landed.

const MARK: Record<"own" | "bystander" | "opponent" | "assassin", { glyph: string; ink: string }> =
  {
    own: { glyph: "✓", ink: "text-emerald-300" },
    bystander: { glyph: "✗", ink: "text-fg-muted" },
    opponent: { glyph: "✗", ink: "text-amber-300" },
    assassin: { glyph: "☠", ink: "text-rose-300" },
  };

const NO_TOUCH: Partial<Record<TurnEnd, string>> = {
  "clue-timeout": "ran out of time for a clue",
  "guess-timeout": "ran out of time to guess",
};

function markOf(result: KeyEntry, own: boolean) {
  if (own) return MARK.own;
  if (result === "assassin") return MARK.assassin;
  if (result === "bystander") return MARK.bystander;
  return MARK.opponent;
}

export function LastTurnLine({ last }: { last: LastTurn }) {
  return (
    <p className="flex min-w-0 items-center gap-1.5 truncate text-3xs text-fg-muted">
      <span className="shrink-0 uppercase tracking-label">Last turn</span>
      <span className={cn("shrink-0 font-black uppercase tracking-pill", TEAM_TEXT[last.team])}>
        {teamName(last.team)}
      </span>
      {last.clue ? (
        <span className="shrink-0 font-black uppercase tracking-pill text-fg-secondary">
          {last.clue.word} {formatClueCount(last.clue.count)}
        </span>
      ) : null}
      {last.touches.length > 0 ? (
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <span aria-hidden>→</span>
          {last.touches.map((t, i) => {
            const mark = markOf(t.result, t.own);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: touches are in order and never move
              <span key={i} className="shrink-0">
                <span className="font-semibold uppercase text-fg-primary">{t.word}</span>{" "}
                <span className={mark.ink}>{mark.glyph}</span>
              </span>
            );
          })}
        </span>
      ) : (
        <span className="truncate">{NO_TOUCH[last.end] ?? "touched nothing"}</span>
      )}
    </p>
  );
}
