import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import GameCard from "../components/GameCard";
import { games } from "../games/registry";
import type { GameDefinition } from "../games/types";
import { fetchMyInventory } from "../lib/inventory";

export default function GameGallery() {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
      <header className="flex shrink-0 items-center justify-between border-b border-white/5 px-4 py-3 sm:px-6 sm:py-4">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-400 transition hover:text-white"
        >
          <svg aria-hidden="true" viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z"
              clipRule="evenodd"
            />
          </svg>
          Dashboard
        </Link>
        <span className="text-xs font-semibold uppercase tracking-[0.3em] text-accent-400">
          Gallery
        </span>
        <span aria-hidden="true" className="hidden w-20 sm:block" />
      </header>

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
