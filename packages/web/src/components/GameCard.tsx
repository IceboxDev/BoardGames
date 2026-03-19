import { Link } from "react-router-dom";
import type { GameDefinition } from "../games/types";

export default function GameCard({ game, index = 0 }: { game: GameDefinition; index?: number }) {
  const { accentColor: colors } = game;

  return (
    <Link
      to={`/play/${game.slug}`}
      className={`group relative flex flex-col overflow-hidden rounded-xl border border-white/[0.06] bg-surface-900 transition-all duration-200 ${colors.border} card-shine animate-card-fade-up`}
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        {game.thumbnail ? (
          <img
            src={game.thumbnail}
            alt={game.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div
            className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${colors.gradient}`}
          >
            <span className="font-mono text-3xl font-bold text-white/[0.06]">{game.slug}</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/20 to-transparent" />
      </div>

      <div
        className={`relative flex flex-1 flex-col gap-2 px-5 py-4 transition-colors duration-200 ${colors.hoverBg}`}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-200 transition-colors group-hover:text-white">
            {game.title}
          </h3>
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className={`h-4 w-4 text-gray-600 transition-all duration-200 ${colors.arrow} translate-x-0 group-hover:translate-x-0.5`}
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <p className="text-sm leading-relaxed text-gray-500">{game.description}</p>
      </div>
    </Link>
  );
}
