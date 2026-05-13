import { maxPlayersAsNumber } from "@boardgames/core/bgg";
import { motion } from "framer-motion";
import type { FamilyInfo } from "../../games/families";
import type { BggGame, GameDefinition } from "../../games/types";
import type { ReactionAggregate } from "../../lib/calendar-games";
import { CheckIcon, FlameIcon } from "../icons";
import { BggInline } from "./BggInline";
import { stripBggHtml } from "./bgg-helpers";
import GameReactions from "./GameReactions";

/**
 * Carousel card that stands in for an entire game family. The center card
 * shows variant chips to swap which member is "active" (drives thumbnail,
 * title, BGG meta, fits-badge, and the reactions slug). Off-center cards
 * just show the active member's thumbnail and a "+N variants" hint, keeping
 * coverflow performance the same as a single-game card.
 *
 * Voting/reactions remain per-slug — switching to UNO Flip and hyping
 * commits the hype to "uno-flip", not to the family.
 */
type Props = {
  family: FamilyInfo;
  visibleMembers: GameDefinition[];
  /** Current active member's slug, owned by the parent so it persists across
   * center changes. The parent also owns the picker that mutates it (the
   * lifted variant chip strip rendered by `GameCarousel3D`). */
  activeSlug: string;

  offset: number;
  minPlayers: number;
  maxPlayers: number;
  date: string;
  reactions: Record<string, ReactionAggregate>;
  onClick: () => void;

  cardW: number;
  cardH: number;
  spreadMax: number;
  zMax: number;
  compact: boolean;

  /** Math constants from GameCarousel3D (kept here for symmetry, not redefined). */
  asymptote: (offset: number, max: number) => number;
  ROTATE_MAX: number;
  SCALE_MIN: number;
  OPACITY_MIN: number;
  REF_CARD_H: number;
};

export default function FamilyCarouselCard({
  family,
  visibleMembers,
  activeSlug,
  offset,
  minPlayers,
  maxPlayers,
  date,
  reactions,
  onClick,
  cardW,
  cardH,
  spreadMax,
  zMax,
  compact,
  asymptote,
  ROTATE_MAX,
  SCALE_MIN,
  OPACITY_MIN,
  REF_CARD_H,
}: Props) {
  const absOff = Math.abs(offset);
  const hidden = absOff > 5;
  const isCenter = offset === 0;

  const active =
    visibleMembers.find((m) => m.slug === activeSlug) ?? visibleMembers[0] ?? family.canonical;
  const fits = fitsRange(active, minPlayers, maxPlayers);
  const isBestForHeadcount =
    active.bgg.bestPlayerCount !== null &&
    minPlayers > 0 &&
    active.bgg.bestPlayerCount === minPlayers;
  const aggregate = reactions[active.slug];

  const thumbH = cardH * (270 / REF_CARD_H);
  const bodyH = cardH * (290 / REF_CARD_H);

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
      aria-label={
        isCenter
          ? `${active.title} (${family.displayName} family), current selection`
          : `Show ${family.displayName}`
      }
      className="absolute left-1/2 top-1/2 origin-center cursor-pointer text-left focus:outline-none"
      style={
        {
          width: cardW,
          height: cardH,
          marginLeft: -cardW / 2,
          marginTop: -cardH / 2,
          backfaceVisibility: "hidden",
          zIndex: 100 - absOff,
          "--accent": active.accentHex,
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
      {/* Visible card frame — overflow-hidden lives here (not on motion.div)
          so the variant rim buttons can straddle the left border. */}
      <div
        className={`relative h-full w-full overflow-hidden rounded-2xl bg-surface-900 transition-shadow ${
          isBestForHeadcount
            ? "border-2 border-amber-400/80 shadow-2xl shadow-amber-500/40"
            : "border border-white/10 shadow-2xl shadow-black/40"
        }`}
      >
        {/* Thumbnail */}
        <div className="relative w-full overflow-hidden" style={{ height: thumbH }}>
          <img
            src={active.thumbnail}
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
              style={{ boxShadow: `inset 0 0 36px ${active.accentHex}55` }}
            />
          )}
          {/* Family badge top-right (replaces the year badge — variant-aware) */}
          <span
            className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.14em] backdrop-blur-sm"
            style={{ color: family.canonical.accentHex }}
          >
            <StackIcon />
            {visibleMembers.length} variants
          </span>
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
                slug={active.slug}
                accentHex={active.accentHex}
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
          className={`flex flex-col ${compact ? "gap-1.5 px-3 py-2.5" : "gap-2 px-5 py-3"}`}
          style={{ height: bodyH }}
        >
          <span
            className="block h-0.5 w-12 rounded-full"
            style={{ backgroundColor: active.accentHex }}
            aria-hidden="true"
          />
          <h3
            className={`truncate font-bold leading-tight text-white ${compact ? "text-lg" : "text-xl"}`}
          >
            {active.title}
          </h3>
          <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400 sm:text-[11px] xl:text-xs">
            <span className={isBestForHeadcount ? "text-amber-300" : undefined}>
              {playerRange(active.bgg)}
              {isBestForHeadcount && ` · best at ${minPlayers}`}
            </span>
            {" · "}
            {playTime(active.bgg)}
          </p>

          <BggInline bgg={active.bgg} compact={compact} />

          {!compact && active.descriptions.default && (
            // Same pinned layout as the single-game card in GameCarousel3D —
            // see the comment there for why line-clamp-7 + pinned leading is
            // the deterministic truncation strategy.
            <p className="line-clamp-7 text-[10px] leading-snug text-gray-400 sm:text-[11px] xl:text-xs 3xl:text-sm">
              {stripBggHtml(active.descriptions.default)}
            </p>
          )}
        </div>
      </div>

      {/* Variant chip strips live OUTSIDE this card — `GameCarousel3D`
          renders one shadow motion.div per family unit at the carousel-
          root level (outside the fade mask) and mirrors this card's
          transforms so the chips visually attach to the card while staying
          unmasked. Don't render an in-card copy here or the two would
          overdraw on every card. */}
    </motion.div>
  );
}

export function VariantChipStrip({
  members,
  activeSlug,
  interactive,
  onPick,
  minPlayers,
  maxPlayers,
}: {
  members: GameDefinition[];
  activeSlug: string;
  interactive: boolean;
  onPick: (slug: string) => void;
  minPlayers: number;
  maxPlayers: number;
}) {
  return (
    <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Variant">
      {members.map((m) => {
        const active = m.slug === activeSlug;
        const fits = fitsRange(m, minPlayers, maxPlayers);
        const variantLabel = m.family?.variant ?? m.title;
        return (
          // biome-ignore lint/a11y/useSemanticElements: visually a button, semantically a radio — keeps the thumbnail-disc layout
          <button
            key={m.slug}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`Show variant ${m.title}`}
            title={variantLabel}
            disabled={!interactive}
            onClick={(e) => {
              e.stopPropagation();
              if (interactive) onPick(m.slug);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className={`relative h-7 w-7 shrink-0 overflow-hidden rounded-full transition-transform ${
              active ? "scale-110" : "hover:scale-105"
            } ${interactive ? "" : "opacity-90"}`}
            style={{
              boxShadow: active
                ? `0 0 0 2px ${m.accentHex}, 0 0 10px ${m.accentHex}99`
                : "0 0 0 1px rgba(255,255,255,0.35), 0 0 6px rgba(0,0,0,0.6)",
              opacity: active ? 1 : interactive ? 0.85 : 0.9,
            }}
          >
            <img
              src={m.thumbnail}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
            {!fits && interactive && (
              <span
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-center bg-black/55 text-[9px] font-bold text-white/80"
              >
                ✕
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// Helpers — duplicated from GameCarousel3D for self-containment. These are
// pure formatting functions; if either copy moves into a shared util later
// this file follows.

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

function StackIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-2.5 w-2.5"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="6" width="10" height="7" rx="1" />
      <path d="M5 6V4.5h8V11" />
    </svg>
  );
}
