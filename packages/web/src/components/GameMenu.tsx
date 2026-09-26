import { LibraryOwnersResponseSchema } from "@boardgames/core/protocol";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { groupForPresentation } from "../games/families";
import { games } from "../games/registry";
import { isPlayable } from "../games/types";
import { useCurrentUser } from "../hooks/useCurrentUser.ts";
import { EMPTY_FILTERS, filterGames, type GameFilters } from "../lib/game-filters";
import { qk } from "../lib/query-keys";
import { jsonQuery } from "../lib/typed-query";
import GameCard from "./GameCard";
import GameLibraryFilters from "./GameLibraryFilters";
import { DescriptionGrid } from "./game";
import OnlineFamilyCard from "./OnlineFamilyCard";
import { Button, EmptyState } from "./ui";

// The first grid row (4 cards at the widest `2xl:grid-cols-4` layout) is above
// the fold — load those thumbnails eagerly so they don't queue behind the lazy
// rest on a cold refresh.
const EAGER_ROW = 4;

export default function GameMenu() {
  const { isAdmin, user } = useCurrentUser();
  const navigate = useNavigate();
  const [filters, setFilters] = useState<GameFilters>(EMPTY_FILTERS);

  // Admins browse the full catalog (incl. coming-soon entries); everyone
  // else sees only playable games. Filter the flat list first, then group
  // into presentation units so families collapse based on the games that
  // actually survive the filter.
  const base = useMemo(() => (isAdmin ? games : games.filter(isPlayable)), [isAdmin]);
  // "Owned by" draws on member libraries, which (like profiles) only
  // game-night members see — online-only accounts don't get the filter.
  const ownersQuery = useQuery({
    queryKey: qk.libraryOwners(),
    queryFn: jsonQuery("/api/user/inventory/owners", LibraryOwnersResponseSchema),
    enabled: user !== null && user.onlineMode !== "online",
  });
  const owners = ownersQuery.data?.owners;
  const ownerLibraries = useMemo(
    () => new Map((owners ?? []).map((o) => [o.id, new Set(o.slugs)])),
    [owners],
  );
  const filtered = useMemo(
    () => filterGames(base, filters, ownerLibraries),
    [base, filters, ownerLibraries],
  );
  const units = useMemo(() => groupForPresentation(filtered), [filtered]);

  // Every default description that can appear in the grid (incl. all family
  // members). The uniform card font is sized so the longest of these fits —
  // computed from the full set, not the filtered view, so the text size
  // doesn't jump around as filters change.
  const descriptionTexts = useMemo(
    () => base.map((g) => g.descriptions.default).filter(Boolean),
    [base],
  );

  return (
    <div className="flex h-full flex-col bg-grid">
      {/* Solo trainers that aren't a board game's own practice mode. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 px-4 pt-3 sm:px-8 lg:px-12">
        <span className="text-2xs font-semibold uppercase tracking-label text-fg-muted">
          Trainers
        </span>
        <Button variant="secondary" size="sm" onClick={() => navigate("/trainer/geography")}>
          World Geography
        </Button>
      </div>
      {base.length > 0 && (
        <div className="shrink-0 px-4 py-3 sm:px-8 lg:px-12">
          <GameLibraryFilters
            filters={filters}
            onChange={setFilters}
            resultCount={filtered.length}
            totalCount={base.length}
            showPlayableFilter={base.some((g) => !isPlayable(g))}
            owners={owners}
          />
        </div>
      )}

      <div className="scrollbar-hide flex-1 overflow-y-auto px-4 pb-8 sm:px-8 lg:px-12">
        {base.length === 0 ? (
          <EmptyState
            title="No games registered"
            description={
              <>
                Add a game module under{" "}
                <code className="rounded bg-surface-800 px-1.5 py-0.5 font-mono text-xs text-accent-400">
                  src/games/
                </code>
              </>
            }
          />
        ) : units.length === 0 ? (
          <EmptyState
            title="No games match these filters"
            action={
              <Button
                variant="link"
                onClick={() => setFilters(EMPTY_FILTERS)}
                className="text-accent-400 hover:text-accent-300"
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          <DescriptionGrid
            texts={descriptionTexts}
            className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4"
          >
            {units.map((unit, i) =>
              unit.kind === "single" ? (
                <GameCard
                  key={unit.game.slug}
                  game={unit.game}
                  href={unit.game.kind === "playable" ? `/play/${unit.game.slug}` : undefined}
                  index={i}
                  priority={i < EAGER_ROW}
                />
              ) : (
                <OnlineFamilyCard
                  key={unit.family.id}
                  family={unit.family}
                  visibleMembers={unit.visibleMembers}
                  index={i}
                  priority={i < EAGER_ROW}
                />
              ),
            )}
          </DescriptionGrid>
        )}
      </div>
    </div>
  );
}
