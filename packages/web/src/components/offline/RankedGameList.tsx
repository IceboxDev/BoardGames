import { useMemo } from "react";
import type { GameDefinition } from "../../games/types";
import type { ReactionAggregate } from "../../lib/calendar-games";
import GameReactions from "./GameReactions";

type Props = {
  date: string;
  games: GameDefinition[];
  reactions: Record<string, ReactionAggregate>;
  /** Server-computed ordered top-5 slugs. When provided, the list renders
   * exactly these in order — avoiding any drift between server and client
   * tie-break logic. When absent, falls back to local ranking (kept so the
   * component stays usable for any future caller that doesn't have the
   * server payload yet). */
  topSlugs?: string[];
};

const EMPTY: ReactionAggregate = { hype: 0, teach: 0, learn: 0, viewer: [] };
const RESULT_CAP = 5;

export default function RankedGameList({ date, games, reactions, topSlugs }: Props) {
  const ranked = useMemo(() => {
    if (topSlugs && topSlugs.length > 0) {
      const bySlug = new Map(games.map((g) => [g.slug, g]));
      const out: { game: GameDefinition; agg: ReactionAggregate }[] = [];
      for (const slug of topSlugs.slice(0, RESULT_CAP)) {
        const g = bySlug.get(slug);
        if (!g) continue;
        out.push({ game: g, agg: reactions[slug] ?? EMPTY });
      }
      return out;
    }
    return games
      .filter((g) => (reactions[g.slug]?.hype ?? 0) > 0)
      .map((g) => ({ game: g, agg: reactions[g.slug] ?? EMPTY }))
      .sort((a, b) => {
        if (b.agg.hype !== a.agg.hype) return b.agg.hype - a.agg.hype;
        // Bonus tiebreaker: "learn" votes only count toward support if at
        // least one teach is present. A learner with no teacher is wishful,
        // not actionable, so the game shouldn't gain rank from it.
        const aLearn = a.agg.teach > 0 ? a.agg.learn : 0;
        const bLearn = b.agg.teach > 0 ? b.agg.learn : 0;
        const aSupport = a.agg.teach + aLearn;
        const bSupport = b.agg.teach + bLearn;
        if (bSupport !== aSupport) return bSupport - aSupport;
        const aRating = a.game.bgg.averageRating ?? 0;
        const bRating = b.game.bgg.averageRating ?? 0;
        if (bRating !== aRating) return bRating - aRating;
        return a.game.title.localeCompare(b.game.title);
      })
      .slice(0, RESULT_CAP);
  }, [games, reactions, topSlugs]);

  if (ranked.length === 0) return null;

  return (
    <div className="scrollbar-thin flex h-full w-full max-w-3xl flex-col gap-2 overflow-y-auto px-1 py-2">
      <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.25em] text-amber-300">
        Tonight's picks
      </p>
      <ul className="flex flex-col gap-2">
        {ranked.map(({ game, agg }, i) => (
          <li key={game.slug}>
            <RankedRow game={game} aggregate={agg} date={date} rank={i + 1} />
          </li>
        ))}
      </ul>
    </div>
  );
}

type RowProps = {
  game: GameDefinition;
  aggregate: ReactionAggregate;
  date: string;
  rank: number;
};

function RankedRow({ game, aggregate, date, rank }: RowProps) {
  const isTop = rank === 1;
  const meta = formatMeta(game);
  return (
    <div
      className="flex items-center gap-3 rounded-2xl border bg-surface-900/80 p-2 pr-3 transition"
      style={{
        borderColor: isTop ? game.accentHex : "color-mix(in srgb, white 8%, transparent)",
        boxShadow: isTop
          ? `0 0 0 1px ${game.accentHex}55, 0 8px 24px -12px ${game.accentHex}55`
          : undefined,
      }}
    >
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl">
        <img
          src={game.thumbnail}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums"
            style={{
              backgroundColor: isTop ? game.accentHex : "color-mix(in srgb, white 8%, transparent)",
              color: isTop ? "#000" : "#d1d5db",
            }}
          >
            <span className="sr-only">Rank </span>
            {rank}
          </span>
          <h3 className="truncate text-sm font-semibold text-white">{game.title}</h3>
          {isTop && (
            <span
              className="shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.18em]"
              style={{
                backgroundColor: `color-mix(in srgb, ${game.accentHex} 22%, transparent)`,
                color: game.accentHex,
              }}
            >
              Top pick
            </span>
          )}
        </div>
        {meta && <p className="truncate text-[11px] text-gray-400">{meta}</p>}
      </div>

      <div className="shrink-0">
        <GameReactions
          date={date}
          slug={game.slug}
          accentHex={game.accentHex}
          aggregate={aggregate}
          size="sm"
        />
      </div>
    </div>
  );
}

function formatMeta(game: GameDefinition): string {
  const parts: string[] = [];
  const { bgg } = game;
  const minP = bgg.minPlayers;
  const maxP = bgg.maxPlayers;
  if (minP && maxP) {
    parts.push(minP === maxP ? `${minP}p` : `${minP}–${maxP}p`);
  }
  const t = bgg.playingTime ?? bgg.minPlayTime ?? bgg.maxPlayTime;
  if (t) parts.push(`${t} min`);
  if (bgg.averageRating != null) parts.push(`★ ${bgg.averageRating.toFixed(1)}`);
  return parts.join(" · ");
}
