import { type CSSProperties, type ReactNode, useState } from "react";
import "../game/new-highlight.css";
import type { GameDefinition } from "../../games/types.ts";
import { cn } from "../../lib/cn.ts";
import { resolveGame } from "../../lib/games-by-slug.ts";
import { NewBadge } from "../game/badges.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { GameDetailModal } from "./GameDetailModal.tsx";

// Renders a list of game slugs as a responsive thumbnail grid, resolving each
// slug to its registry entry (thumbnail + accent + title). Used for the
// profile's library, favorites, and wishlist sections. Unknown slugs (a game
// dropped from the catalog) are silently skipped. Each tile opens a full game
// detail modal — one game per click, so the detail shows the complete
// description (the dashboard Gallery used to own this; the profile now does).

type GameSlugGridProps = {
  slugs: readonly string[];
  emptyIcon?: ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
  /**
   * Sort tiles alphabetically by title. Off by default so curated lists
   * (favorites / wishlist) keep their hand-picked order; on for the library,
   * whose stored order is just the arbitrary order games were toggled in.
   */
  sort?: boolean;
  /**
   * Give freshly-added games (catalog `isNew`) the cyan→blue "new" frame the
   * game-night carousel uses. On for the LIBRARY only: there the border says
   * "this member owns a new arrival", which is exactly the signal worth
   * carrying. A wishlisted new game is the opposite of owned, so the
   * highlight would misread there.
   */
  highlightNew?: boolean;
};

export function GameSlugGrid({
  slugs,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  sort = false,
  highlightNew = false,
}: GameSlugGridProps) {
  const [selected, setSelected] = useState<GameDefinition | null>(null);
  const resolved = slugs
    .map((slug) => resolveGame(slug))
    .filter((g): g is GameDefinition => Boolean(g));
  if (sort) resolved.sort((a, b) => a.title.localeCompare(b.title));

  if (resolved.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
        {resolved.map((game) => {
          const isNew = highlightNew && game.isNew === true;
          return (
            <li key={game.slug} style={{ "--accent": game.accentHex } as CSSProperties}>
              {/* biome-ignore lint/correctness/noRestrictedElements: card-shaped clickable game tile */}
              <button
                type="button"
                onClick={() => setSelected(game)}
                className={cn(
                  "group block w-full overflow-hidden rounded-xl bg-surface-900/60 text-left transition-colors",
                  isNew
                    ? // The accent ring is dropped so the cyan glow reads clean.
                      "border-2 card-frame-new"
                    : "border border-white/[0.06] ring-1 ring-[var(--accent)]/20 hover:ring-[var(--accent)]/60",
                )}
              >
                <div className="relative aspect-square overflow-hidden bg-surface-800">
                  <img
                    src={game.thumbnail}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                  {isNew && (
                    <span className="absolute left-1.5 top-1.5">
                      <NewBadge />
                    </span>
                  )}
                </div>
                <p className="truncate px-2.5 py-2 text-xs font-semibold text-fg-primary group-hover:text-white">
                  {game.title}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
      {selected && <GameDetailModal game={selected} onClose={() => setSelected(null)} />}
    </>
  );
}
