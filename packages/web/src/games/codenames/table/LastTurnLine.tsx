import { formatClueCount } from "@boardgames/core/games/codenames/clue-rules";
import { TONE_TEXT } from "../../../components/ui/tones";
import { cn } from "../../../lib/cn";
import type { LastTurnSummary, TouchMark } from "./table-logic";
import type { CoverTone } from "./WordGrid";

// The last turn in one line, under "… is thinking of a clue": who played,
// their clue, and each touch with how it went — so a player who looked away
// (or just joined the tab) knows what changed without opening the History.
// The board's numbered badges show the same touches where they landed.

const MARK: Record<TouchMark, { glyph: string; ink: string }> = {
  own: { glyph: "✓", ink: TONE_TEXT.emerald },
  bystander: { glyph: "✗", ink: "text-fg-muted" },
  opponent: { glyph: "✗", ink: TONE_TEXT.amber },
  assassin: { glyph: "☠", ink: TONE_TEXT.rose },
};

const WHO_INK: Record<CoverTone, string> = {
  red: "text-cn-red",
  blue: "text-cn-blue",
  green: "text-cn-green",
  tan: "text-cn-tan",
  ink: "text-fg-strong",
};

export function LastTurnLine({ last }: { last: LastTurnSummary }) {
  return (
    <p className="flex min-w-0 items-center gap-1.5 truncate text-3xs text-fg-muted">
      <span className="shrink-0 uppercase tracking-label">Last turn</span>
      <span className={cn("shrink-0 font-black uppercase tracking-pill", WHO_INK[last.tone])}>
        {last.who}
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
            const mark = MARK[t.mark];
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
        <span className="truncate">{last.idle}</span>
      )}
    </p>
  );
}
