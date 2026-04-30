import { motion, type PanInfo } from "framer-motion";
import { useCallback, useEffect, useState } from "react";
import type { BggGame, GameDefinition } from "../../games/types";

type Props = {
  games: GameDefinition[];
  participantCount: number;
};

const CARD_WIDTH = 320;
const CARD_HEIGHT = 480;
const X_STEP = 240;
const ROTATE_STEP = 30;
const Z_STEP = 160;

export default function GameCarousel3D({ games, participantCount }: Props) {
  const [center, setCenter] = useState(0);

  const goPrev = useCallback(() => {
    setCenter((c) => Math.max(0, c - 1));
  }, []);

  const goNext = useCallback(() => {
    setCenter((c) => Math.min(games.length - 1, c + 1));
  }, [games.length]);

  // Arrow-key navigation while the carousel (or anything in the modal) has focus.
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
      className="relative flex w-full items-center justify-center"
      style={{ perspective: "1400px" }}
    >
      <button
        type="button"
        onClick={goPrev}
        disabled={center === 0}
        aria-label="Previous game"
        className="absolute left-2 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-surface-900/80 text-white backdrop-blur-sm transition hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-30 sm:left-4"
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
            participantCount={participantCount}
            onClick={() => setCenter(i)}
          />
        ))}
      </motion.div>

      <button
        type="button"
        onClick={goNext}
        disabled={center >= games.length - 1}
        aria-label="Next game"
        className="absolute right-2 top-1/2 z-30 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-surface-900/80 text-white backdrop-blur-sm transition hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-30 sm:right-4"
      >
        <ChevronGlyph direction="right" />
      </button>
    </div>
  );
}

type CardProps = {
  game: GameDefinition;
  offset: number;
  participantCount: number;
  onClick: () => void;
};

function CarouselCard({ game, offset, participantCount, onClick }: CardProps) {
  const absOff = Math.abs(offset);
  const hidden = absOff > 4;
  const isCenter = offset === 0;

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
        x: offset * X_STEP,
        z: -absOff * Z_STEP,
        rotateY: -offset * ROTATE_STEP,
        scale: Math.max(0.45, 1 - absOff * 0.12),
        opacity: hidden ? 0 : Math.max(0.2, 1 - absOff * 0.22),
        pointerEvents: hidden ? "none" : "auto",
      }}
      transition={{ type: "spring", stiffness: 220, damping: 28 }}
    >
      {/* Thumbnail — top half */}
      <div className="relative h-[230px] w-full overflow-hidden">
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
        {participantCount > 0 && fitsCount(game, participantCount) && (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-100 backdrop-blur-sm">
            <CheckIcon />
            Fits {participantCount}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex h-[250px] flex-col gap-2.5 px-5 py-4">
        <span
          className="block h-0.5 w-12 rounded-full"
          style={{ backgroundColor: game.accentHex }}
          aria-hidden="true"
        />
        <h3 className="line-clamp-2 text-lg font-bold leading-tight text-white">{game.title}</h3>
        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400">
          {playerRange(game.bgg)} · {playTime(game.bgg)}
          {game.bgg.minAge ? ` · ${game.bgg.minAge}+` : ""}
        </p>

        <BggInline bgg={game.bgg} />

        {game.bgg.description && (
          <p className="line-clamp-3 text-[11px] leading-relaxed text-gray-400">
            {stripBggHtml(game.bgg.description)}
          </p>
        )}

        {game.bgg.categories.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1">
            {game.bgg.categories.slice(0, 3).map((cat) => (
              <span
                key={cat}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[9px] uppercase tracking-[0.12em] text-gray-400"
              >
                {cat}
              </span>
            ))}
          </div>
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

function fitsCount(game: GameDefinition, n: number): boolean {
  const min = game.bgg.minPlayers ?? 0;
  const max = game.bgg.maxPlayers ?? Number.POSITIVE_INFINITY;
  return n >= min && n <= max;
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

// BGG descriptions arrive with HTML entities (&#10;, &mdash; etc) and stray tags. Strip rough.
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
      className="h-4 w-4"
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
