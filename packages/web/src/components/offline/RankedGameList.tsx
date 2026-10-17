import { useMemo } from "react";
import type { GameDefinition } from "../../games/types";
import type { Attendee, ReactionAggregate } from "../../lib/calendar-games";
import { cn } from "../../lib/cn";
import { UndoIcon } from "../icons";
import { Avatar } from "../ui/Avatar";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Eyebrow, MicroLabel } from "../ui/Label";
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
  /** Admins only: the next ranked slugs that just missed `topSlugs`, shown
   * as dashed rows under the list. Empty/absent for everyone else. */
  runnerUpSlugs?: string[];
  /** Admins only: clears every vote on the night (the caller confirms). */
  onResetVotes?: () => void;
  resettingVotes?: boolean;
  /**
   * Private night in host-pick mode: the list is the host's lineup in pick
   * order, not a vote result — no counts, one "in the lineup" toggle, and the
   * bringer's face on each row (from `attendees[].bringing`).
   */
  lineup?: { hostName: string | null; attendees: Attendee[]; viewerCanPick: boolean };
  /** The viewer's reactions don't count on this night — render read-only. */
  reactionsDisabled?: boolean;
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

export default function RankedGameList({
  date,
  games,
  reactions,
  topSlugs,
  runnerUpSlugs,
  onResetVotes,
  resettingVotes = false,
  lineup,
  reactionsDisabled = false,
}: Props) {
  // Who brings which lineup game — the bringing assignment is per attendee.
  const bringerBySlug = useMemo(() => {
    const out = new Map<string, Attendee>();
    for (const a of lineup?.attendees ?? []) for (const slug of a.bringing) out.set(slug, a);
    return out;
  }, [lineup]);
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
  const runnersUp = useMemo(() => {
    if (lineup || !runnerUpSlugs?.length) return [];
    const bySlug = new Map(games.map((g) => [g.slug, g]));
    return runnerUpSlugs.flatMap((slug) => {
      const g = bySlug.get(slug);
      return g ? [{ game: g, agg: reactions[slug] ?? EMPTY }] : [];
    });
  }, [games, reactions, runnerUpSlugs, lineup]);

  if (ranked.length === 0) return null;
  const rowDisabled = reactionsDisabled || (lineup ? !lineup.viewerCanPick : false);

  return (
    <div className="scrollbar-thin flex h-full w-full max-w-3xl flex-col gap-2 overflow-y-auto px-1 py-2">
      {/* Fixed height so the row is the same with or without the admin's
          reset button — the list never shifts between viewers. */}
      <div className="flex h-7 items-center justify-between gap-2 px-2">
        <Eyebrow tone="amber">
          {lineup
            ? `${lineup.hostName ? `${lineup.hostName}'s` : "Host's"} lineup`
            : "Tonight's picks"}
        </Eyebrow>
        {onResetVotes && !lineup && (
          <Button
            variant="ghost"
            size="xs"
            onClick={onResetVotes}
            loading={resettingVotes}
            title="Clear every vote on this night"
          >
            <UndoIcon className="h-3.5 w-3.5" />
            Reset votes
          </Button>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {ranked.map(({ game, agg }, i) => (
          <li key={game.slug}>
            <RankedRow
              game={game}
              aggregate={agg}
              date={date}
              rank={i + 1}
              mode={lineup ? "pick" : "vote"}
              disabled={rowDisabled}
              bringer={lineup ? (bringerBySlug.get(game.slug) ?? null) : null}
            />
          </li>
        ))}
      </ul>
      {runnersUp.length > 0 && (
        <section
          aria-label="Just missed the cut (admins only)"
          className="mt-2 flex flex-col gap-2"
        >
          <div className="flex items-center gap-2 px-2">
            <MicroLabel>Just missed the cut</MicroLabel>
            <span aria-hidden="true" className="h-px flex-1 bg-line" />
            <Badge size="xs" shape="pill" ring title="Only admins see these rows">
              Admins only
            </Badge>
          </div>
          <ul className="flex flex-col gap-2">
            {runnersUp.map(({ game, agg }, i) => (
              <li key={game.slug}>
                <RankedRow
                  game={game}
                  aggregate={agg}
                  date={date}
                  rank={ranked.length + i + 1}
                  mode="vote"
                  disabled={rowDisabled}
                  bringer={null}
                  runnerUp
                />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

type RowProps = {
  game: GameDefinition;
  aggregate: ReactionAggregate;
  date: string;
  rank: number;
  mode: "vote" | "pick";
  disabled: boolean;
  /** Who brings it (host-pick lineup rows only). */
  bringer: Attendee | null;
  /** An admin-only row past the cut: dashed outline, no fill, quieter art. */
  runnerUp?: boolean;
};

function RankedRow({
  game,
  aggregate,
  date,
  rank,
  mode,
  disabled,
  bringer,
  runnerUp = false,
}: RowProps) {
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
      className={cn(
        "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-card-2xl border p-2 transition sm:gap-x-3 sm:pr-3",
        runnerUp ? "border-dashed border-line-strong bg-transparent" : "bg-surface-900/80",
      )}
      style={
        runnerUp
          ? undefined
          : {
              borderColor: isTop ? game.accentHex : DIM_CHROME,
              boxShadow: isTop
                ? `0 0 0 1px ${game.accentHex}55, 0 8px 24px -12px ${game.accentHex}55`
                : undefined,
            }
      }
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-card-xl",
          runnerUp ? "h-10 w-10 sm:h-12 sm:w-12" : "h-12 w-12 sm:h-16 sm:w-16",
        )}
      >
        <img
          src={game.thumbnail}
          alt=""
          className={cn("h-full w-full object-cover", runnerUp && "opacity-70 saturate-50")}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
      </div>

      <div className="flex min-w-36 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-3xs font-bold tabular-nums",
              runnerUp && "border border-dashed border-line-strong text-fg-muted",
            )}
            style={
              runnerUp
                ? undefined
                : {
                    backgroundColor: isTop ? game.accentHex : DIM_CHROME,
                    color: isTop ? "#000" : RANK_TEXT_DIM,
                  }
            }
          >
            <span className="sr-only">Rank </span>
            {rank}
          </span>
          {/* No "Top pick" chip — the #1 row already reads as the winner via
              its accent border, glow, and colored rank badge, and on phone
              widths the chip stole the room the title needs. */}
          <h3
            className={cn(
              "truncate text-sm font-semibold",
              runnerUp ? "text-fg-secondary" : "text-fg-strong",
            )}
          >
            {game.title}
          </h3>
        </div>
        {meta && (
          <p className={cn("truncate text-2xs", runnerUp ? "text-fg-muted" : "text-fg-secondary")}>
            {meta}
          </p>
        )}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        {bringer && (
          // Label BEFORE the face: the two labels differ in width, so the
          // avatar sits against the toggle and every row's face lines up.
          <span
            className="inline-flex items-center gap-1.5 text-3xs text-fg-secondary"
            title={`${bringer.name} brings it`}
          >
            <span className="hidden sm:inline">
              {bringer.isHost ? "at the host's" : "brings it"}
            </span>
            <Avatar name={bringer.name} image={bringer.image ?? null} size="xs" />
          </span>
        )}
        <GameReactions
          date={date}
          slug={game.slug}
          accentHex={game.accentHex}
          aggregate={aggregate}
          size="sm"
          mode={mode}
          disabled={disabled}
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
