import { games } from "../games/registry";
import GameCard from "./GameCard";

export default function GameMenu() {
  return (
    <div className="flex h-full flex-col bg-grid">
      <div className="shrink-0 px-4 py-6 sm:px-8 sm:py-8 lg:px-12">
        <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">Board Game Lab</h1>
        <p className="mt-1.5 text-sm text-gray-500">
          Mathematical analysis and strategy research for tabletop games. Select a game to explore.
        </p>
      </div>

      <div className="scrollbar-hide flex-1 overflow-y-auto px-4 pb-8 sm:px-8 lg:px-12">
        {games.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 px-8 py-16 text-center">
            <p className="text-sm text-gray-500">
              No games registered. Add a game module under{" "}
              <code className="rounded bg-surface-800 px-1.5 py-0.5 font-mono text-xs text-accent-400">
                src/games/
              </code>
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {games.map((game, i) => (
              <GameCard
                key={game.slug}
                game={game}
                href={game.component ? `/play/${game.slug}` : undefined}
                index={i}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
