import { motion, type PanInfo } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import type { BggGame, GameDefinition } from "../../games/types";
import type { ReactionAggregate } from "../../lib/calendar-games";
import GameReactions from "./GameReactions";

type Props = {
  games: GameDefinition[];
  /** Confirmed-attendee count (lower bound of the player-count range). */
  minPlayers: number;
  /** Confirmed + tentative count (upper bound of the player-count range). */
  maxPlayers: number;
  /** Date key — used as the scope for reactions. Empty string = no reactions UI. */
  date: string;
  reactions: Record<string, ReactionAggregate>;
};

const CARD_WIDTH = 380;
const CARD_HEIGHT = 560;
// All four axes use the same tanh asymptote so cards bunch coherently. ROTATE
// must stay under 90° or backface-hidden cards vanish. K controls softness
// (higher = more linear); MAX caps the asymptote.
const SPREAD_K = 2.5;
const SPREAD_MAX = 520;
const ROTATE_MAX = 65;
const Z_MAX = 380;
const SCALE_MIN = 0.55;
const OPACITY_MIN = 0.45;

function asymptote(offset: number, max: number): number {
  return Math.sign(offset) * max * Math.tanh(Math.abs(offset) / SPREAD_K);
}

export default function GameCarousel3D({ games, minPlayers, maxPlayers, date, reactions }: Props) {
  const [center, setCenter] = useState(0);

  const goPrev = useCallback(() => {
    setCenter((c) => Math.max(0, c - 1));
  }, []);

  const goNext = useCallback(() => {
    setCenter((c) => Math.min(games.length - 1, c + 1));
  }, [games.length]);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [goPrev, goNext]);

  function handleDragEnd(_: unknown, info: PanInfo) {
    const threshold = 60;
    const velocity = info.velocity.x;
    const offset = info.offset.x;
    if (offset > threshold || velocity > 400) goPrev();
    else if (offset < -threshold || velocity < -400) goNext();
  }

  if (games.length === 0) return null;

  return (
    <div
      className="relative flex w-full items-center justify-center overflow-hidden"
      style={{ perspective: "1600px" }}
    >
      <button
        type="button"
        onClick={goPrev}
        disabled={center === 0}
        aria-label="Previous game"
        className="absolute left-2 top-1/2 z-30 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-surface-900/80 text-white backdrop-blur-sm transition hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-30 sm:left-4"
      >
        <ChevronGlyph direction="left" />
      </button>

      <motion.div
        className="relative mx-auto"
        style={{
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          transformStyle: "preserve-3d",
        }}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.15}
        onDragEnd={handleDragEnd}
      >
        {games.map((game, i) => (
          <CarouselCard
            key={game.slug}
            game={game}
            offset={i - center}
            minPlayers={minPlayers}
            maxPlayers={maxPlayers}
            date={date}
            aggregate={reactions[game.slug]}
            onClick={() => setCenter(i)}
          />
        ))}
      </motion.div>

      <button
        type="button"
        onClick={goNext}
        disabled={center >= games.length - 1}
        aria-label="Next game"
        className="absolute right-2 top-1/2 z-30 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-surface-900/80 text-white backdrop-blur-sm transition hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-30 sm:right-4"
      >
        <ChevronGlyph direction="right" />
      </button>
    </div>
  );
}

type CardProps = {
  game: GameDefinition;
  offset: number;
  minPlayers: number;
  maxPlayers: number;
  date: string;
  aggregate: ReactionAggregate | undefined;
  onClick: () => void;
};

function CarouselCard({
  game,
  offset,
  minPlayers,
  maxPlayers,
  date,
  aggregate,
  onClick,
}: CardProps) {
  const absOff = Math.abs(offset);
  const hidden = absOff > 5;
  const isCenter = offset === 0;
  const fits = fitsRange(game, minPlayers, maxPlayers);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      tabIndex={hidden ? -1 : 0}
      aria-hidden={hidden}
      aria-label={isCenter ? `${game.title}, current selection` : `Show ${game.title}`}
      className="absolute left-1/2 top-1/2 origin-center cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-surface-900 text-left shadow-2xl shadow-black/40 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
      style={
        {
          width: CARD_WIDTH,
          height: CARD_HEIGHT,
          marginLeft: -CARD_WIDTH / 2,
          marginTop: -CARD_HEIGHT / 2,
          backfaceVisibility: "hidden",
          zIndex: 100 - absOff,
          "--accent": game.accentHex,
        } as React.CSSProperties
      }
      animate={{
        x: asymptote(offset, SPREAD_MAX),
        z: -Math.abs(asymptote(offset, Z_MAX)),
        rotateY: -asymptote(offset, ROTATE_MAX),
        scale: Math.max(SCALE_MIN, 1 - Math.abs(asymptote(offset, 1 - SCALE_MIN))),
        opacity: hidden
          ? 0
          : Math.max(OPACITY_MIN, 1 - Math.abs(asymptote(offset, 1 - OPACITY_MIN))),
        pointerEvents: hidden ? "none" : "auto",
      }}
      transition={{ type: "spring", stiffness: 220, damping: 28 }}
    >
      {/* Thumbnail */}
      <div className="relative h-[270px] w-full overflow-hidden">
        <img
          src={game.thumbnail}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/30 to-transparent" />
        {isCenter && (
          <span
            aria-hidden="true"
            className="absolute inset-0"
            style={{ boxShadow: `inset 0 0 36px ${game.accentHex}55` }}
          />
        )}
        {game.bgg.yearPublished && (
          <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white/85 backdrop-blur-sm">
            {game.bgg.yearPublished}
          </span>
        )}
        {fits && (minPlayers > 0 || maxPlayers > 0) && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-100 backdrop-blur-sm">
            <CheckIcon />
            Fits {fitsLabel(minPlayers, maxPlayers)}
          </span>
        )}

        {date && (
          <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2">
            <GameReactions
              date={date}
              slug={game.slug}
              accentHex={game.accentHex}
              aggregate={aggregate ?? { hype: 0, teach: 0, learn: 0, viewer: [] }}
              size="md"
              disabled={!isCenter}
            />
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex h-[290px] flex-col gap-2.5 px-5 py-4">
        <span
          className="block h-0.5 w-12 rounded-full"
          style={{ backgroundColor: game.accentHex }}
          aria-hidden="true"
        />
        <h3 className="truncate text-xl font-bold leading-tight text-white">{game.title}</h3>
        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400">
          {playerRange(game.bgg)} · {playTime(game.bgg)}
          {game.bgg.minAge ? ` · ${game.bgg.minAge}+` : ""}
        </p>

        <BggInline bgg={game.bgg} />

        {game.bgg.description && (
          <p className="min-h-0 flex-1 overflow-hidden text-[11px] leading-relaxed text-gray-400">
            {stripBggHtml(game.bgg.description)}
          </p>
        )}
      </div>
    </motion.button>
  );
}

function BggInline({ bgg }: { bgg: BggGame }) {
  const hasRating = bgg.averageRating !== null;
  const hasWeight = bgg.averageWeight !== null && bgg.averageWeight > 0;
  if (!hasRating && !hasWeight) return null;

  return (
    <div className="flex flex-col gap-1.5 border-y border-white/[0.05] py-2 text-[11px] text-gray-400">
      {hasRating && bgg.averageRating !== null && (
        <div className="flex items-center gap-2">
          <StarIcon />
          <span className="font-semibold text-gray-200 tabular-nums">
            {bgg.averageRating.toFixed(1)}
          </span>
          <span className="text-gray-500">/ 10</span>
          {bgg.numRatings ? (
            <span className="ml-auto text-[10px] text-gray-500">
              {formatCount(bgg.numRatings)} ratings
            </span>
          ) : null}
        </div>
      )}
      {hasWeight && bgg.averageWeight !== null && (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-gray-500">
            Weight
          </span>
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${Math.min(100, (bgg.averageWeight / 5) * 100)}%`,
                backgroundColor: "var(--accent)",
              }}
            />
          </div>
          <span className="shrink-0 font-semibold text-gray-200 tabular-nums">
            {bgg.averageWeight.toFixed(1)}
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-[0.14em] text-gray-500">
            {weightLabel(bgg.averageWeight)}
          </span>
        </div>
      )}
    </div>
  );
}

function fitsRange(game: GameDefinition, lo: number, hi: number): boolean {
  const min = game.bgg.minPlayers ?? 0;
  const max = game.bgg.maxPlayers ?? Number.POSITIVE_INFINITY;
  return min <= hi && max >= lo;
}

function fitsLabel(lo: number, hi: number): string {
  if (lo === hi) return String(lo);
  return `${lo}–${hi}`;
}

function playerRange(bgg: BggGame): string {
  const min = bgg.minPlayers;
  const max = bgg.maxPlayers;
  if (min == null && max == null) return "— players";
  if (min === max) return `${min} player${min === 1 ? "" : "s"}`;
  return `${min ?? "?"}–${max ?? "?"} players`;
}

function playTime(bgg: BggGame): string {
  const minT = bgg.minPlayTime;
  const maxT = bgg.maxPlayTime;
  if (minT && maxT && minT !== maxT) return `${minT}–${maxT} min`;
  const t = bgg.playingTime ?? minT ?? maxT;
  if (!t) return "— min";
  return `${t} min`;
}

function weightLabel(w: number): string {
  if (w < 2) return "Light";
  if (w < 3) return "Medium-light";
  if (w < 3.5) return "Medium";
  if (w < 4) return "Medium-heavy";
  return "Heavy";
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
}

function stripBggHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&#10;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function ChevronGlyph({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {direction === "left" ? <path d="M10 3l-5 5 5 5" /> : <path d="M6 3l5 5-5 5" />}
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
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
