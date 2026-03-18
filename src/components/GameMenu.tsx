import { games } from "../games/registry";
import GameCard from "./GameCard";

export default function GameMenu() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      {/* Header */}
      <div className="mb-10">
        <h1 className="text-2xl font-bold tracking-tight text-white">Board Game Lab</h1>
        <p className="mt-1.5 text-sm text-gray-500">
          Mathematical analysis and strategy research for tabletop games. Select a game to explore.
        </p>
      </div>

      {/* Grid */}
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
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {games.map((game, i) => (
            <GameCard key={game.slug} game={game} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
