import type { ProfilePerGameStat, ProfileStats } from "@boardgames/core/protocol";
import { coopMaxScoreForSlug } from "../../games/score-config.ts";
import { resolveGame } from "../../lib/games-by-slug.ts";
import { EmptyState } from "../ui/EmptyState.tsx";

// Per-game performance, best → worst. "Performance" is Scheme-A for competitive
// games (free-for-all losses graded by placement, not a flat 0), and the team
// score ratio (x / max) for scored co-ops like Just One — so a co-op shows its
// score, never a misleading "0W". Games the user only moderated have no
// performance and fall to the end. The bar color tracks performance: green
// (strong) → amber → red (weak).

/** Unified 0..1 performance used for sort, bar width, and color. Null = no
 *  competitive/co-op result (moderator-only) → renders greyed at the bottom. */
function rowPerformance(row: ProfilePerGameStat): number | null {
  if (row.performance !== null) return row.performance;
  if (row.coopScoreAvg !== null) {
    const max = coopMaxScoreForSlug(row.slug);
    if (max && max > 0) return Math.min(1, row.coopScoreAvg / max);
  }
  return null;
}

/** Red (0) → amber (.5) → green (1); muted grey for no-performance rows. */
function perfColor(perf: number | null): string {
  if (perf === null) return "#6b7387";
  const hue = 8 + perf * 132; // 8 ≈ red-orange … 140 ≈ green
  return `hsl(${hue}deg 68% 47%)`;
}

export function ProfileStatsPanel({ stats }: { stats: ProfileStats }) {
  if (stats.perGame.length === 0) {
    return (
      <EmptyState
        title="No game stats yet"
        description="Performance appears once matches are recorded."
      />
    );
  }

  const rows = stats.perGame
    .map((row) => ({ row, perf: rowPerformance(row) }))
    .sort((a, b) => (b.perf ?? -1) - (a.perf ?? -1) || b.row.plays - a.row.plays);

  return (
    <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map(({ row, perf }) => {
        const game = resolveGame(row.slug);
        const max = coopMaxScoreForSlug(row.slug);
        const isCoop = row.coopScoreAvg !== null;
        const ran = row.plays - row.wins - row.losses - row.coopPlays;
        return (
          <li key={row.slug}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  aria-hidden="true"
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: game?.accentHex ?? "#6366f1" }}
                />
                <span className="truncate font-semibold text-fg-primary">{row.title}</span>
              </span>
              <span className="shrink-0 tabular-nums">
                {isCoop ? (
                  // Just One et al.: the score IS the performance — no W/L.
                  <span className="font-bold text-fg-primary">
                    {row.coopScoreAvg?.toFixed(1)}
                    {max ? ` / ${max}` : ""}
                  </span>
                ) : perf !== null ? (
                  <>
                    <span className="font-bold text-fg-primary">{Math.round(perf * 100)}%</span>{" "}
                    <span className="text-fg-muted">
                      {row.wins}W·{row.losses}L{ran > 0 ? ` · ${ran} ran` : ""}
                    </span>
                  </>
                ) : (
                  <span className="text-fg-muted">{ran > 0 ? `ran ${ran}×` : "—"}</span>
                )}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-800">
              <div
                className="h-full rounded-full transition-[width]"
                style={{
                  width: `${Math.round((perf ?? 0) * 100)}%`,
                  backgroundColor: perfColor(perf),
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
