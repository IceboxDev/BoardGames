import type { PlayerSkillResponse, SkillLeaderboardsResponse } from "@boardgames/core/protocol";
import { useState } from "react";
import { cn } from "../../../lib/cn.ts";
import { resolveGame } from "../../../lib/games-by-slug.ts";
import { ChevronDownIcon } from "../../icons";
import { Badge } from "../../ui/Badge.tsx";
import { LeaderboardList, type LeaderboardRow } from "./LeaderboardList.tsx";
import { ordinal } from "./trait-copy.ts";

// Per-game rankings, on demand: one compact row per game with art, the
// viewed player's standing badge, and the full board only when tapped.
// Rows sort by the player's standing (their best games first), then plays.

function gameBoardRows(boards: SkillLeaderboardsResponse, slug: string): LeaderboardRow[] {
  const board = boards.games.find((b) => b.slug === slug);
  return (board?.entries ?? []).map((e) => ({
    userId: e.userId,
    name: boards.players[e.userId]?.name ?? "Unknown player",
    image: boards.players[e.userId]?.image ?? null,
    rank: e.rank,
    value: `${e.matches} games`,
  }));
}

function rankTone(rank: number): "amber" | "orange" | "neutral" {
  return rank === 1 ? "amber" : rank === 3 ? "orange" : "neutral";
}

export function GameRankings({
  skill,
  boards,
  defaultOpen = null,
}: {
  skill: PlayerSkillResponse;
  boards: SkillLeaderboardsResponse;
  /** Initially expanded game — used by the dev preview for screenshots. */
  defaultOpen?: string | null;
}) {
  const [open, setOpen] = useState<string | null>(defaultOpen);

  const rowsData = boards.games
    .map((board) => {
      const mine = board.entries.find((e) => e.userId === skill.userId);
      const totalPlays = board.entries.reduce((s, e) => s + e.matches, 0);
      return { slug: board.slug, size: board.entries.length, mine, totalPlays };
    })
    .sort(
      (a, b) =>
        (a.mine?.rank ?? 99) - (b.mine?.rank ?? 99) ||
        b.totalPlays - a.totalPlays ||
        a.slug.localeCompare(b.slug),
    );

  if (rowsData.length === 0) return null;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {rowsData.map(({ slug, size, mine }) => {
        const game = resolveGame(slug);
        const isOpen = open === slug;
        return (
          <div
            key={slug}
            className={cn(
              "rounded-xl transition",
              isOpen && "bg-white/[0.04] ring-1 ring-white/10",
            )}
          >
            {/* biome-ignore lint/correctness/noRestrictedElements: full-row accordion toggle — Button chrome doesn't fit */}
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : slug)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-white/5"
            >
              {game && (
                <img
                  src={game.thumbnail}
                  alt=""
                  loading="lazy"
                  className="h-8 w-8 shrink-0 rounded-md object-cover"
                />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-fg-primary">
                  {game?.title ?? slug}
                </span>
                <span className="block text-2xs text-fg-muted">{size} ranked players</span>
              </span>
              {mine ? (
                <Badge tone={rankTone(mine.rank)} size="xs" shape="pill">
                  {ordinal(mine.rank)}
                </Badge>
              ) : (
                <span className="text-2xs text-fg-muted">—</span>
              )}
              <ChevronDownIcon
                className={cn(
                  "h-3.5 w-3.5 shrink-0 text-fg-muted transition-transform",
                  isOpen && "rotate-180",
                )}
              />
            </button>

            {isOpen && (
              <div className="px-2.5 pb-2.5">
                <LeaderboardList
                  rows={gameBoardRows(boards, slug)}
                  highlightUserId={skill.userId}
                  topN={5}
                />
              </div>
            )}
          </div>
        );
      })}
      <p className="mt-1 px-2.5 text-3xs text-fg-muted">
        Games rank by hidden per-game rating once they have enough recorded matches. Tap a game for
        its board.
      </p>
    </div>
  );
}
