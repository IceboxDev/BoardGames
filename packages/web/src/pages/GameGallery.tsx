import { useEffect, useMemo, useState } from "react";
import GameCard from "../components/GameCard";
import { TopNav, TopNavBackButton } from "../components/TopNav";
import { games } from "../games/registry";
import type { GameDefinition } from "../games/types";
import { fetchMyInventory, getCachedInventory } from "../lib/inventory";

export default function GameGallery() {
  const initial = getCachedInventory();
  const [slugs, setSlugs] = useState<string[]>(initial ?? []);
  const [loading, setLoading] = useState(initial === null);

  useEffect(() => {
    if (getCachedInventory() !== null) return;
    let cancelled = false;
    fetchMyInventory()
      .then((s) => {
        if (!cancelled) setSlugs(s);
      })
      .catch(() => {
        if (!cancelled) setSlugs([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const owned = useMemo<GameDefinition[]>(
    () =>
      slugs
        .map((s) => games.find((g) => g.slug === s))
        .filter((g): g is GameDefinition => Boolean(g)),
    [slugs],
  );

  return (
    <div className="flex min-h-dvh flex-col bg-surface-950 bg-grid">
      <TopNav>
        <TopNavBackButton to="/" label="Dashboard" />
      </TopNav>

      <main className="flex min-h-0 flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8 lg:px-12">
        <div className="shrink-0">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">My Gallery</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            {loading
              ? "Loading…"
              : owned.length === 0
                ? "Nothing here yet."
                : `${owned.length} ${owned.length === 1 ? "game" : "games"} in your library`}
          </p>
        </div>

        {loading ? null : owned.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="rounded-2xl border border-dashed border-white/10 px-10 py-16 text-center">
              <p className="text-sm text-gray-500">
                No games in your library yet. Ask an admin to add some.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {owned.map((game, i) => (
              <GameCard key={game.slug} game={game} index={i} showComingSoon={false} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
