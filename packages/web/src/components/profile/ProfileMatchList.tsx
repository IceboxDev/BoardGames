import { extractParticipantIds } from "@boardgames/core/history/participant-results";
import type { MatchRecord } from "@boardgames/core/protocol";
import type { CSSProperties, ReactNode } from "react";
import { formatShortDate } from "../../lib/date-format.ts";
import { resolveGame } from "../../lib/games-by-slug.ts";
import { matchResultBadge } from "../../lib/match-result-badge.ts";
import { TrophyIcon } from "../icons";
import { Badge } from "../ui/Badge.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { Surface } from "../ui/Surface.tsx";

// Renders a profile owner's matches with a game-aware result badge — placement
// for score games (Won / 2nd / Last), the team score for Just One, Won/Lost
// otherwise (see `lib/match-result-badge`). The page supplies the match array
// (recent slice or the full infinite list) plus an optional footer.

type ProfileMatchListProps = {
  matches: readonly MatchRecord[];
  userId: string;
  firstName: string;
  footer?: ReactNode;
};

export function ProfileMatchList({ matches, userId, firstName, footer }: ProfileMatchListProps) {
  if (matches.length === 0) {
    return (
      <EmptyState
        icon={<TrophyIcon className="h-4 w-4" />}
        title="No matches logged yet"
        description={`${firstName}'s recorded games will appear here.`}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2">
        {matches.map((match) => {
          const game = resolveGame(match.gameSlug);
          const badge = matchResultBadge(match.outcome, userId, match.gameSlug);
          const playerCount = extractParticipantIds(match.outcome).length;
          return (
            <Surface
              as="li"
              key={match.id}
              variant="raised"
              padding="none"
              style={{ "--accent": game?.accentHex ?? "#6366f1" } as CSSProperties}
              className="flex items-center gap-3 p-2.5"
            >
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface-800 ring-1 ring-[var(--accent)]/30">
                {game ? (
                  <img
                    src={game.thumbnail}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg-primary">{match.gameTitle}</p>
                <p className="text-2xs text-fg-muted">
                  {formatShortDate(match.playedAt)} · {playerCount}{" "}
                  {playerCount === 1 ? "player" : "players"}
                </p>
              </div>
              {badge && (
                <Badge tone={badge.tone} size="sm" className="min-w-[3.75rem] justify-center">
                  {badge.label}
                </Badge>
              )}
            </Surface>
          );
        })}
      </ul>
      {footer}
    </div>
  );
}
