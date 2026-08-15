import type { ProfileMatchSummaryResponse } from "@boardgames/core/protocol";
import { formatMonthYear, formatShortDate } from "../../../lib/date-format.ts";
import { resolveGame } from "../../../lib/games-by-slug.ts";
import { summaryBadge } from "../../../lib/summary-badge.ts";
import { TrophyIcon } from "../../icons";
import { Badge } from "../../ui/Badge.tsx";
import { EmptyState } from "../../ui/EmptyState.tsx";
import { MicroLabel } from "../../ui/Label.tsx";
import { Surface } from "../../ui/Surface.tsx";

// Month-grouped timeline of pre-derived match units. Purpose-built compact
// rows (the 655-line admin `MatchCard` renders full outcomes and edit
// affordances — far heavier than this page needs).

function GameThumb({ slug, title }: { slug: string | null; title: string }) {
  const thumb = slug ? resolveGame(slug)?.thumbnail : undefined;
  if (thumb) {
    return <img src={thumb} alt="" className="h-9 w-16 shrink-0 rounded-md object-cover" />;
  }
  return (
    <span className="flex h-9 w-16 shrink-0 items-center justify-center rounded-md bg-surface-800 text-sm font-bold text-fg-muted">
      {title.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function MatchTimeline({
  items,
  filtered,
}: {
  items: ProfileMatchSummaryResponse["items"];
  /** Whether an active filter produced this (empty-state copy differs). */
  filtered: boolean;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<TrophyIcon className="h-4 w-4" />}
        title={filtered ? "Nothing matches these filters" : "No matches logged yet"}
        description={
          filtered
            ? "Loosen the result, year, or game filter to see more."
            : "Recorded games will build the timeline here."
        }
      />
    );
  }

  // Group consecutive items (already newest-first) by "YYYY-MM".
  const groups: { key: string; label: string; items: typeof items }[] = [];
  for (const item of items) {
    const key = item.playedAt.slice(0, 7);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(item);
    else groups.push({ key, label: formatMonthYear(item.playedAt), items: [item] });
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.key}>
          <MicroLabel className="mb-1.5 block font-semibold">{group.label}</MicroLabel>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const badge = summaryBadge(item);
              const coCount = item.coPlayerIds.length;
              return (
                <Surface
                  as="li"
                  key={item.matchId}
                  variant="tile"
                  padding="none"
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <GameThumb slug={item.gameSlug} title={item.gameTitle} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-fg-primary">
                      <span className="truncate">{item.gameTitle}</span>
                      {item.sessions > 1 && (
                        <Badge tone="purple" size="xs">
                          ×{item.sessions} sessions
                        </Badge>
                      )}
                    </p>
                    <p className="text-3xs text-fg-muted">
                      {formatShortDate(item.playedAt)}
                      {" · "}
                      {coCount === 0 ? "solo" : `with ${coCount} other${coCount === 1 ? "" : "s"}`}
                    </p>
                  </div>
                  <Badge tone={badge.tone} size="sm">
                    {badge.label}
                  </Badge>
                </Surface>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
