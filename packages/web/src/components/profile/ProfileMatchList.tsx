import {
  deriveParticipantResult,
  extractParticipantIds,
} from "@boardgames/core/history/participant-results";
import type { MatchRecord } from "@boardgames/core/protocol";
import type { CSSProperties, ReactNode } from "react";
import { resolveGame } from "../../lib/games-by-slug.ts";
import { formatShortDate } from "../../lib/profile-format.ts";
import { TrophyIcon } from "../icons";
import type { BadgeTone } from "../ui/Badge.tsx";
import { Badge } from "../ui/Badge.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";

// Renders a profile owner's matches with a Won/Lost/Ran-it badge derived from
// the shared core helper (so it never disagrees with the server's win counts).
// The page supplies the match array (recent slice or the full infinite list)
// plus an optional footer (the "show more" control).

type ResultBadge = { label: string; tone: BadgeTone };

function resultBadge(result: ReturnType<typeof deriveParticipantResult>): ResultBadge | null {
  switch (result) {
    case "win":
      return { label: "Won", tone: "emerald" };
    case "loss":
      return { label: "Lost", tone: "rose" };
    case "moderator":
      return { label: "Ran it", tone: "neutral" };
    default:
      return null;
  }
}

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
          const badge = resultBadge(deriveParticipantResult(match.outcome, userId));
          const playerCount = extractParticipantIds(match.outcome).length;
          return (
            <li
              key={match.id}
              style={{ "--accent": game?.accentHex ?? "#6366f1" } as CSSProperties}
              className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-surface-900/60 p-2.5"
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
                <Badge tone={badge.tone} size="sm">
                  {badge.label}
                </Badge>
              )}
            </li>
          );
        })}
      </ul>
      {footer}
    </div>
  );
}
