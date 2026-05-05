import { motion, type PanInfo } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
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
  /**
   * Fires when the user navigates past the rightmost card (right-arrow key,
   * right chevron click, or swipe-left at the end). When provided, the
   * carousel does not clamp at the last card — it hands off to the caller,
   * which lets `RsvpModal` use this as the natural way to flip into the
   * results view.
   */
  onPastEnd?: () => void;
};

// Reference card dimensions — the design was tuned at 380×560. All scaled
// constants below are derived as ratios of these so the visual relationships
// (spread, depth, perspective) stay coherent at any card size.
const REF_CARD_W = 380;
const REF_CARD_H = 560;
const ASPECT = REF_CARD_H / REF_CARD_W;

const MIN_CARD_W = 240; // legible on a 320–375px phone
const MAX_CARD_W = 520; // sensible cap on 4K

// All four axes use the same tanh asymptote so cards bunch coherently. ROTATE
// must stay under 90° or backface-hidden cards vanish. K controls softness
// (higher = more linear); MAX caps the asymptote.
const SPREAD_K = 2.5;
const ROTATE_MAX = 65; // dimensionless angle
const SCALE_MIN = 0.55; // dimensionless ratio
const OPACITY_MIN = 0.45; // dimensionless ratio

// Defensive floor — only triggers on extremely tight slots. With the 0.92
// width factor a typical phone produces a ≥320px card, so description stays
// visible. Drops description + weight bar below this width.
const COMPACT_THRESHOLD = 230;

function asymptote(offset: number, max: number): number {
  return Math.sign(offset) * max * Math.tanh(Math.abs(offset) / SPREAD_K);
}

export default function GameCarousel3D({
  games,
  minPlayers,
  maxPlayers,
  date,
  reactions,
  onPastEnd,
}: Props) {
  const [center, setCenter] = useState(0);
  const atEnd = center >= games.length - 1;
  const rootRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const goPrev = useCallback(() => {
    setCenter((c) => Math.max(0, c - 1));
  }, []);

  const goNext = useCallback(() => {
    setCenter((c) => {
      if (c >= games.length - 1) {
        if (onPastEnd) onPastEnd();
        return c;
      }
      return c + 1;
    });
  }, [games.length, onPastEnd]);

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

  // Derive card dimensions from measured container size with clamps. On phones
  // the card is width-bounded; on desktop the MAX cap or height/ASPECT bounds
  // it (so the 0.92 factor only matters when width is the binding constraint —
  // i.e. portrait phones — where we want the card as large as legibility allows
  // and accept that the rotated side cards mostly clip behind overflow-hidden.
  const measured = size.w > 0 && size.h > 0;
  const cardW = measured
    ? Math.max(MIN_CARD_W, Math.min(MAX_CARD_W, size.w * 0.92, size.h / ASPECT))
    : REF_CARD_W;
  const cardH = cardW * ASPECT;
  const compact = cardW < COMPACT_THRESHOLD;

  // 3D constants scale with cardW so the spread/depth stay visually coherent.
  const spreadMax = cardW * (520 / REF_CARD_W);
  const zMax = cardW * (380 / REF_CARD_W);
  const perspective = cardW * (1600 / REF_CARD_W);

  return (
    <div
      ref={rootRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden"
      style={{
        perspective: `${perspective}px`,
        opacity: measured ? 1 : 0,
      }}
    >
      <button
        type="button"
        onClick={goPrev}
        disabled={center === 0}
        aria-label="Previous game"
        className="absolute left-2 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-surface-900/80 text-white backdrop-blur-sm transition hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-30 sm:left-4 sm:h-12 sm:w-12"
      >
        <ChevronGlyph direction="left" />
      </button>

      <motion.div
        className="relative mx-auto"
        style={{
          width: cardW,
          height: cardH,
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
            cardW={cardW}
            cardH={cardH}
            spreadMax={spreadMax}
            zMax={zMax}
            compact={compact}
          />
        ))}
      </motion.div>

      <button
        type="button"
        onClick={goNext}
        disabled={atEnd && !onPastEnd}
        aria-label={atEnd && onPastEnd ? "Switch to results" : "Next game"}
        className="absolute right-2 top-1/2 z-30 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-surface-900/80 text-white backdrop-blur-sm transition hover:bg-surface-800 disabled:cursor-not-allowed disabled:opacity-30 sm:right-4 sm:h-12 sm:w-12"
        style={
          atEnd && onPastEnd
            ? { borderColor: "rgb(251 191 36 / 0.6)", color: "rgb(253 230 138)" }
            : undefined
        }
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
  cardW: number;
  cardH: number;
  spreadMax: number;
  zMax: number;
  compact: boolean;
};

function CarouselCard({
  game,
  offset,
  minPlayers,
  maxPlayers,
  date,
  aggregate,
  onClick,
  cardW,
  cardH,
  spreadMax,
  zMax,
  compact,
}: CardProps) {
  const absOff = Math.abs(offset);
  const hidden = absOff > 5;
  const isCenter = offset === 0;
  const fits = fitsRange(game, minPlayers, maxPlayers);

  // Inner heights preserve the original 270:290 split inside a 560-tall card.
  const thumbH = cardH * (270 / REF_CARD_H);
  const bodyH = cardH * (290 / REF_CARD_H);

  // Use motion.div with role="button" rather than motion.button — the card
  // contains <GameReactions> which renders <button> elements, and HTML doesn't
  // allow nested buttons (the browser auto-closes the outer button before the
  // inner one, breaking the layout).
  return (
    <motion.div
      role="button"
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      tabIndex={hidden ? -1 : 0}
      aria-hidden={hidden}
      aria-label={isCenter ? `${game.title}, current selection` : `Show ${game.title}`}
      className="absolute left-1/2 top-1/2 origin-center cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-surface-900 text-left shadow-2xl shadow-black/40 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
      style={
        {
          width: cardW,
          height: cardH,
          marginLeft: -cardW / 2,
          marginTop: -cardH / 2,
          backfaceVisibility: "hidden",
          zIndex: 100 - absOff,
          "--accent": game.accentHex,
        } as React.CSSProperties
      }
      animate={{
        x: asymptote(offset, spreadMax),
        z: -Math.abs(asymptote(offset, zMax)),
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
      <div className="relative w-full overflow-hidden" style={{ height: thumbH }}>
        <img
          src={game.thumbnail}
          alt=""
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          fetchPriority={isCenter ? "high" : "low"}
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
              size={compact ? "sm" : "md"}
              disabled={!isCenter}
              hideCount
            />
          </div>
        )}
      </div>

      {/* Body */}
      <div
        className={`flex flex-col ${compact ? "gap-1.5 px-3 py-3" : "gap-2.5 px-5 py-4"}`}
        style={{ height: bodyH }}
      >
        <span
          className="block h-0.5 w-12 rounded-full"
          style={{ backgroundColor: game.accentHex }}
          aria-hidden="true"
        />
        <h3
          className={`truncate font-bold leading-tight text-white ${compact ? "text-lg" : "text-xl"}`}
        >
          {game.title}
        </h3>
        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400">
          {playerRange(game.bgg)} · {playTime(game.bgg)}
          {game.bgg.minAge ? ` · ${game.bgg.minAge}+` : ""}
        </p>

        <BggInline bgg={game.bgg} compact={compact} />

        {!compact && game.bgg.description && (
          <p className="min-h-0 flex-1 overflow-hidden text-[11px] leading-relaxed text-gray-400">
            {stripBggHtml(game.bgg.description)}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function BggInline({ bgg, compact }: { bgg: BggGame; compact: boolean }) {
  const hasRating = bgg.averageRating !== null;
  const hasWeight = !compact && bgg.averageWeight !== null && bgg.averageWeight > 0;
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
