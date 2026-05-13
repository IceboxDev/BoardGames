import { maxPlayersAsNumber } from "@boardgames/core/bgg";
import { motion, type PanInfo } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { groupForPresentation, type PresentationUnit } from "../../games/families";
import type { BggGame, GameDefinition } from "../../games/types";
import type { ReactionAggregate } from "../../lib/calendar-games";
import { CheckIcon, ChevronLeftIcon, ChevronRightIcon, FlameIcon } from "../icons";
import { BggInline } from "./BggInline";
import { stripBggHtml } from "./bgg-helpers";
import FamilyCarouselCard, { VariantChipStrip } from "./FamilyCarouselCard";
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

// Bumped from 240 → 280 so the description's `line-clamp-7` always has room to
// render 5–6 lines after the title + player-range + BggInline rows take their
// share of `bodyH`. At cardW=240 the leftover body slot was only ~60–80px,
// which truncated the description below its char budget; cardW=280 buys ~25%
// more body height for ~17% more card width. Still legible on a 320–375px
// phone — the 0.92 width factor in the cardW formula keeps phones comfortable.
const MIN_CARD_W = 280;
const MAX_CARD_W = 640; // sensible cap on 4K — bumped from 520 so the
// description font has room to breathe at 14-15px on a 4K monitor

// Vertical breathing room (total px subtracted from the height budget before
// dividing by ASPECT). Without this, height-bound viewports (1366×768,
// 1440×900, 13" laptops with browser chrome, etc.) produce cards that exactly
// fill the masked wrapper — and the wrapper's `overflow-hidden` then clips
// the amber "best at" shadow at the bottom AND lets the 20px vertical fade
// ramp eat into the card's own top/bottom edges. The 4K case never hits this
// because `MAX_CARD_W` caps `cardW` first; the laptop case currently fills
// exactly and is barely affected. 32px (16 each side) is enough margin that
// the fade ramp completely clears the card and the shadow has somewhere to
// extend into, while staying small enough that the laptop anchor's visible
// card size shifts by ~4% — imperceptible in practice.
const VERTICAL_BREATHING = 32;

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
  // Project games into presentation units — families collapse to one card,
  // singletons stay as-is. The carousel navigates over UNITS, not games.
  const units = useMemo<PresentationUnit[]>(() => groupForPresentation(games), [games]);

  const [center, setCenter] = useState(0);
  const atEnd = center >= units.length - 1;
  // Per-family active member, persisted across center changes so the user's
  // last variant pick survives swiping away and back.
  const [activeByFamily, setActiveByFamily] = useState<Map<string, string>>(() => new Map());
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
      if (c >= units.length - 1) {
        if (onPastEnd) onPastEnd();
        return c;
      }
      return c + 1;
    });
  }, [units.length, onPastEnd]);

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

  if (units.length === 0) return null;

  function setActiveForFamily(familyId: string, slug: string) {
    setActiveByFamily((prev) => {
      const next = new Map(prev);
      next.set(familyId, slug);
      return next;
    });
  }

  // Derive card dimensions from measured container size with clamps. On phones
  // the card is width-bounded; on desktop the MAX cap or height/ASPECT bounds
  // it (so the 0.92 factor only matters when width is the binding constraint —
  // i.e. portrait phones — where we want the card as large as legibility allows
  // and accept that the rotated side cards mostly clip behind overflow-hidden.
  //
  // Height budget subtracts VERTICAL_BREATHING so the card never sits flush
  // against the masked wrapper's hard-clip edges. Without it, intermediate
  // height-bound viewports (1366×768, 1440×900, laptops with browser chrome
  // taking a chunk of vertical space) crop the amber "best at" shadow at the
  // bottom and pull the 20px fade ramp into the card's own top/bottom edges.
  const measured = size.w > 0 && size.h > 0;
  const heightBudget = Math.max(0, size.h - VERTICAL_BREATHING);
  const cardW = measured
    ? Math.max(MIN_CARD_W, Math.min(MAX_CARD_W, size.w * 0.92, heightBudget / ASPECT))
    : REF_CARD_W;
  const cardH = cardW * ASPECT;
  const thumbH = cardH * (270 / REF_CARD_H);
  const compact = cardW < COMPACT_THRESHOLD;

  // 3D constants scale with cardW so the spread/depth stay visually coherent.
  const spreadMax = cardW * (520 / REF_CARD_W);
  const zMax = cardW * (380 / REF_CARD_W);
  const perspective = cardW * (1600 / REF_CARD_W);

  return (
    <div
      ref={rootRef}
      className="relative flex h-full w-full items-center justify-center"
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
        <ChevronLeftIcon />
      </button>

      {/* Cards are clipped by their own container with a soft-edge mask
          composed of two linear gradients combined via `mask-composite:
          intersect` (WebKit `source-in`).
          - Horizontal ramp is the wider 56px — side cards bunch at high
            rotation angles and the wider ramp dissolves them gracefully.
          - Vertical ramp is shorter (20px). It exists only to soften the
            amber "best at" glow that extends a few px past the top/bottom
            edges of the centered card. At intermediate viewport heights
            (e.g. 1440×900) where the card sizes up to exactly fill the
            container, a wider vertical ramp would visually clip the card's
            own thumbnail at the top and the reaction row at the bottom.
            20px is enough headroom for the glow and short enough that the
            card content stays intact at any height in our target range.
          Chevrons and the lifted variant chip strips stay outside this
          masked wrapper so they render at full opacity. */}
      <div
        className="relative flex h-full w-full items-center justify-center overflow-hidden"
        style={{
          WebkitMaskImage:
            "linear-gradient(to right, transparent 0, black 56px, black calc(100% - 56px), transparent 100%), linear-gradient(to bottom, transparent 0, black 20px, black calc(100% - 20px), transparent 100%)",
          WebkitMaskComposite: "source-in",
          maskImage:
            "linear-gradient(to right, transparent 0, black 56px, black calc(100% - 56px), transparent 100%), linear-gradient(to bottom, transparent 0, black 20px, black calc(100% - 20px), transparent 100%)",
          maskComposite: "intersect",
        }}
      >
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
          {units.map((unit, i) => {
            if (unit.kind === "single") {
              return (
                <CarouselCard
                  key={unit.game.slug}
                  game={unit.game}
                  offset={i - center}
                  minPlayers={minPlayers}
                  maxPlayers={maxPlayers}
                  date={date}
                  aggregate={reactions[unit.game.slug]}
                  onClick={() => setCenter(i)}
                  cardW={cardW}
                  cardH={cardH}
                  spreadMax={spreadMax}
                  zMax={zMax}
                  compact={compact}
                />
              );
            }
            const activeSlug =
              activeByFamily.get(unit.family.id) ??
              unit.visibleMembers.find((m) => m === unit.family.canonical)?.slug ??
              unit.visibleMembers[0]?.slug ??
              unit.family.canonical.slug;
            return (
              <FamilyCarouselCard
                key={`family:${unit.family.id}`}
                family={unit.family}
                visibleMembers={unit.visibleMembers}
                activeSlug={activeSlug}
                offset={i - center}
                minPlayers={minPlayers}
                maxPlayers={maxPlayers}
                date={date}
                reactions={reactions}
                onClick={() => setCenter(i)}
                cardW={cardW}
                cardH={cardH}
                spreadMax={spreadMax}
                zMax={zMax}
                compact={compact}
                asymptote={asymptote}
                ROTATE_MAX={ROTATE_MAX}
                SCALE_MIN={SCALE_MIN}
                OPACITY_MIN={OPACITY_MIN}
                REF_CARD_H={REF_CARD_H}
              />
            );
          })}
        </motion.div>
      </div>

      {/* Lifted variant chip strips — one motion.div per family unit,
          rendered OUTSIDE the masked wrapper above so chips render at full
          opacity even when their card sits flush against the carousel
          fade. Each shadow motion.div is a card-sized container at the
          card's static position and animates with the *exact same*
          transforms (x, z, rotateY, scale, opacity) and spring as its
          actual card, so the chips visually attach to the card during
          transitions instead of popping into existence at the static
          center after the card finishes moving. Only the centered family's
          chips are visible (others animate to opacity 0); chips are
          interactive only when isCenter. */}
      {measured &&
        units.map((unit, i) => {
          if (unit.kind !== "family") return null;
          const offset = i - center;
          const absOff = Math.abs(offset);
          const hidden = absOff > 5;
          const isCenter = offset === 0;
          const activeSlug =
            activeByFamily.get(unit.family.id) ??
            unit.visibleMembers.find((m) => m === unit.family.canonical)?.slug ??
            unit.visibleMembers[0]?.slug ??
            unit.family.canonical.slug;
          return (
            <motion.div
              key={`chips:${unit.family.id}`}
              className="pointer-events-none absolute z-30 origin-center"
              style={{
                width: cardW,
                height: cardH,
                left: "50%",
                top: "50%",
                marginLeft: -cardW / 2,
                marginTop: -cardH / 2,
                transformStyle: "preserve-3d",
              }}
              animate={{
                x: asymptote(offset, spreadMax),
                z: -Math.abs(asymptote(offset, zMax)),
                rotateY: -asymptote(offset, ROTATE_MAX),
                scale: Math.max(SCALE_MIN, 1 - Math.abs(asymptote(offset, 1 - SCALE_MIN))),
                opacity: hidden ? 0 : isCenter ? 1 : 0,
              }}
              transition={{ type: "spring", stiffness: 220, damping: 28 }}
            >
              <div
                className={`absolute ${isCenter ? "pointer-events-auto" : "pointer-events-none"}`}
                style={{ top: thumbH / 2, left: -14 }}
              >
                <div className="-translate-y-1/2">
                  <VariantChipStrip
                    members={unit.visibleMembers}
                    activeSlug={activeSlug}
                    interactive={isCenter}
                    onPick={(slug) => setActiveForFamily(unit.family.id, slug)}
                    minPlayers={minPlayers}
                    maxPlayers={maxPlayers}
                  />
                </div>
              </div>
            </motion.div>
          );
        })}

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
        <ChevronRightIcon />
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
  // BGG community-voted "best at N" matches the confirmed RSVP-yes count —
  // the strongest game-fit signal we have. Triggers the amber/fire treatment.
  const isBestForHeadcount =
    game.bgg.bestPlayerCount !== null && minPlayers > 0 && game.bgg.bestPlayerCount === minPlayers;

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
      className={`absolute left-1/2 top-1/2 origin-center cursor-pointer overflow-hidden rounded-2xl bg-surface-900 text-left transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400 ${
        isBestForHeadcount
          ? "border-2 border-amber-400/80 shadow-2xl shadow-amber-500/40"
          : "border border-white/10 shadow-2xl shadow-black/40"
      }`}
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
        {isBestForHeadcount ? (
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-white shadow-md shadow-amber-500/40 backdrop-blur-sm">
            <FlameIcon className="h-3 w-3" />
            Best at {minPlayers}
          </span>
        ) : (
          fits &&
          (minPlayers > 0 || maxPlayers > 0) && (
            <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-100 backdrop-blur-sm">
              <CheckIcon className="h-3 w-3" />
              Fits {fitsLabel(minPlayers, maxPlayers)}
            </span>
          )
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
        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400 sm:text-[11px] xl:text-xs">
          <span className={isBestForHeadcount ? "text-amber-300" : undefined}>
            {playerRange(game.bgg)}
            {isBestForHeadcount && ` · best at ${minPlayers}`}
          </span>
          {" · "}
          {playTime(game.bgg)}
        </p>

        <BggInline bgg={game.bgg} compact={compact} />

        {!compact && game.descriptions.default && (
          // Pinned layout: line-clamp-7 is the deterministic truncation
          // boundary across every viewport. Font sizes still scale with
          // breakpoint for readability on big screens, but `leading-snug` is
          // pinned so line-height stays predictable, and `flex-1` /
          // `overflow-hidden` are dropped — `line-clamp-7` handles both
          // height-capping and overflow itself. The generated `default`
          // variant is char-budgeted (~240 chars) to fit within 7 lines even
          // at the smallest cardW + biggest text combination.
          <p className="line-clamp-7 text-[10px] leading-snug text-gray-400 sm:text-[11px] xl:text-xs 3xl:text-sm">
            {stripBggHtml(game.descriptions.default)}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function fitsRange(game: GameDefinition, lo: number, hi: number): boolean {
  const min = game.bgg.minPlayers ?? 0;
  const max = maxPlayersAsNumber(game.bgg.maxPlayers);
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
  const maxLabel = max === "infinity" ? "∞" : (max ?? "?");
  return `${min ?? "?"}–${maxLabel} players`;
}

function playTime(bgg: BggGame): string {
  const minT = bgg.minPlayTime;
  const maxT = bgg.maxPlayTime;
  if (minT && maxT && minT !== maxT) return `${minT}–${maxT} min`;
  const t = bgg.playingTime ?? minT ?? maxT;
  if (!t) return "— min";
  return `${t} min`;
}
