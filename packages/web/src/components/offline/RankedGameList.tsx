import { useMemo } from "react";
import type { GameDefinition } from "../../games/types";
import type { ReactionAggregate } from "../../lib/calendar-games";
import { Eyebrow } from "../ui/Label";
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

// Rank-number text on non-top rows. This is gray-300 (v4's cool grays are
// within 1/255 of the v3 hexes — the OKLCH drift noted in CalendarDayCell.tsx
// is a WARM-ramp problem and doesn't apply here). It stays literal because the
// project's rule is that dark-surface text comes from the fg-* ramp, and no
// fg-* step matches this value: adopting one is a deliberate visual change,
// deferred to the post-batch pass rather than smuggled into a no-op sweep.
const RANK_TEXT_DIM = "#d1d5db";
// Hairline border / badge fill on non-top rows — 8% white. Plain `white` on
// purpose: white never rethemes, so it takes no var() indirection.
const DIM_CHROME = "color-mix(in srgb, white 8%, transparent)";

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
      <Eyebrow tone="amber" className="px-2">
        Tonight's picks
      </Eyebrow>
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
    // `flex-wrap` + the text column's min-width is the phone strategy: when
    // thumb + title + reactions can't share one line, the reactions wrap to
    // their own right-aligned line instead of crushing the title down to a
    // three-letter ellipsis (the old fixed row left ~60px for the title on a
    // 360px screen). On sm+ everything fits on one line and the wrap never
    // engages.
    <div
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl border bg-surface-900/80 p-2 transition sm:gap-x-3 sm:pr-3"
      style={{
        borderColor: isTop ? game.accentHex : DIM_CHROME,
        boxShadow: isTop
          ? `0 0 0 1px ${game.accentHex}55, 0 8px 24px -12px ${game.accentHex}55`
          : undefined,
      }}
    >
      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl sm:h-16 sm:w-16">
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

      <div className="flex min-w-36 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span
            className="inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-3xs font-bold tabular-nums"
            style={{
              backgroundColor: isTop ? game.accentHex : DIM_CHROME,
              color: isTop ? "#000" : RANK_TEXT_DIM,
            }}
          >
            <span className="sr-only">Rank </span>
            {rank}
          </span>
          {/* No "Top pick" chip — the #1 row already reads as the winner via
              its accent border, glow, and colored rank badge, and on phone
              widths the chip stole the room the title needs. */}
          <h3 className="truncate text-sm font-semibold text-white">{game.title}</h3>
        </div>
        {meta && <p className="truncate text-2xs text-fg-secondary">{meta}</p>}
      </div>

      <div className="ml-auto shrink-0">
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
    const maxLabel = maxP === "infinity" ? "∞" : String(maxP);
    parts.push(minP === maxP ? `${minP}p` : `${minP}–${maxLabel}p`);
  }
  const t = bgg.playingTime ?? bgg.minPlayTime ?? bgg.maxPlayTime;
  if (t) parts.push(`${t} min`);
  if (bgg.averageRating != null) parts.push(`★ ${bgg.averageRating.toFixed(1)}`);
  return parts.join(" · ");
}
