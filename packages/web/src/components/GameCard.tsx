import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import type { BggGame, GameDefinition } from "../games/types";

type Props = {
  game: GameDefinition;
  href?: string;
  index?: number;
  /** Whether to render the "Coming soon" badge for catalog-only games. Default true. */
  showComingSoon?: boolean;
};

export default function GameCard({ game, href, index = 0, showComingSoon = true }: Props) {
  const summary = compactSummary(game.bgg);
  const description = game.bgg.description;
  const style: CSSProperties = {
    "--accent": game.accentHex,
    animationDelay: `${index * 80}ms`,
  } as CSSProperties;

  const className =
    "group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-900 " +
    "transition-all duration-300 animate-card-fade-up " +
    "hover:border-[var(--accent)]/40 " +
    "hover:bg-[color-mix(in_srgb,var(--accent)_8%,var(--color-surface-900))]";

  const inner = (
    <>
      <div className="relative aspect-[16/9] overflow-hidden">
        <img
          src={game.thumbnail}
          alt=""
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/20 to-transparent" />
        {showComingSoon && !game.component && (
          <span className="absolute right-2 top-2 rounded-full bg-black/65 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/75 backdrop-blur-sm">
            Coming soon
          </span>
        )}
      </div>

      <div className="relative flex flex-1 flex-col gap-2 px-6 py-5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold text-gray-200 transition-colors group-hover:text-white">
            {game.title}
          </h3>
          {href && (
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 shrink-0 text-gray-600 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
            >
              <path
                fillRule="evenodd"
                d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
        {summary && <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{summary}</p>}
        {description && (
          <p className="line-clamp-6 flex-1 text-sm leading-relaxed text-gray-400">{description}</p>
        )}
        <BggMeta bgg={game.bgg} />
      </div>
    </>
  );

  if (href) {
    return (
      <Link to={href} style={style} className={className}>
        {inner}
      </Link>
    );
  }
  return (
    <div style={style} className={className}>
      {inner}
    </div>
  );
}

function compactSummary(bgg: BggGame): string {
  const parts: string[] = [];
  if (bgg.yearPublished) parts.push(String(bgg.yearPublished));
  if (bgg.minPlayers && bgg.maxPlayers) {
    parts.push(
      bgg.minPlayers === bgg.maxPlayers
        ? `${bgg.minPlayers} players`
        : `${bgg.minPlayers}–${bgg.maxPlayers} players`,
    );
  }
  if (bgg.playingTime) parts.push(`${bgg.playingTime} min`);
  return parts.join(" · ");
}

function weightLabel(w: number): string {
  if (w < 2) return "Light";
  if (w < 3) return "Medium-light";
  if (w < 3.5) return "Medium";
  if (w < 4) return "Medium-heavy";
  return "Heavy";
}

function BggMeta({ bgg }: { bgg: BggGame }) {
  const hasRating = bgg.averageRating !== null;
  const hasWeight = bgg.averageWeight !== null && bgg.averageWeight > 0;
  if (!hasRating && !hasWeight) return null;

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-white/[0.05] pt-3 text-[11px] text-gray-400">
      {hasRating && bgg.averageRating !== null && (
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <StarIcon />
            <span className="font-semibold text-gray-200">{bgg.averageRating.toFixed(1)}</span>
            <span className="text-gray-500">/ 10</span>
          </span>
          {bgg.numRatings ? (
            <span className="text-[10px] text-gray-500">{formatCount(bgg.numRatings)} ratings</span>
          ) : null}
        </div>
      )}
      {hasWeight && bgg.averageWeight !== null && (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-gray-500">
            Complexity
          </span>
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)] transition-[width] duration-500"
              style={{ width: `${Math.min(100, (bgg.averageWeight / 5) * 100)}%` }}
            />
          </div>
          <span className="shrink-0 font-semibold text-gray-200 tabular-nums">
            {bgg.averageWeight.toFixed(1)}
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-gray-500">
            {weightLabel(bgg.averageWeight)}
          </span>
        </div>
      )}
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function StarIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className="h-3.5 w-3.5 text-amber-400"
      aria-hidden="true"
    >
      <path d="M10 1.5l2.6 5.27 5.82.85-4.21 4.1.99 5.78L10 14.77l-5.2 2.73.99-5.78L1.58 7.62l5.82-.85L10 1.5z" />
    </svg>
  );
}
