import type { ProfileStats } from "@boardgames/core/protocol";
import type { CSSProperties } from "react";
import { resolveGame } from "../../lib/games-by-slug.ts";
import { EmptyState } from "../ui/EmptyState.tsx";

// Per-game breakdown: a win-rate bar per game, ordered by plays. Totals live in
// the header's stat tiles; this panel is the deeper "where do they shine" view.

type ProfileStatsPanelProps = {
  stats: ProfileStats;
};

export function ProfileStatsPanel({ stats }: ProfileStatsPanelProps) {
  if (stats.perGame.length === 0) {
    return (
      <EmptyState
        title="No game stats yet"
        description="Win rates appear once matches are recorded."
      />
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {stats.perGame.map((row) => {
        const game = resolveGame(row.slug);
        const rate = row.plays > 0 ? row.wins / row.plays : 0;
        return (
          <li key={row.slug} style={{ "--accent": game?.accentHex ?? "#6366f1" } as CSSProperties}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate font-semibold text-fg-primary">{row.title}</span>
              <span className="shrink-0 tabular-nums text-fg-muted">
                {row.wins}W · {row.plays} {row.plays === 1 ? "play" : "plays"}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-800">
              <div
                className="h-full rounded-full bg-[var(--accent)]"
                style={{ width: `${Math.round(rate * 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
