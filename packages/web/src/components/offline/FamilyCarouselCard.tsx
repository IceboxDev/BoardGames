import { motion } from "framer-motion";
import type { FamilyInfo } from "../../games/families";
import type { BggGame, GameDefinition } from "../../games/types";
import type { ReactionAggregate } from "../../lib/calendar-games";
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
   * center changes. */
  activeSlug: string;
  onSetActive: (slug: string) => void;

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
  onSetActive,
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
          ? `${active.title} (${family.canonical.title} family), current selection`
          : `Show ${family.canonical.title}`
      }
      className="absolute left-1/2 top-1/2 origin-center cursor-pointer overflow-hidden rounded-2xl border border-white/10 bg-surface-900 text-left shadow-2xl shadow-black/40 transition-shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-400"
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
        {/* Variant chip strip — interactive only at center, decorative elsewhere */}
        <VariantChipStrip
          members={visibleMembers}
          activeSlug={active.slug}
          interactive={isCenter}
          onPick={onSetActive}
          minPlayers={minPlayers}
          maxPlayers={maxPlayers}
        />

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
        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-400">
          {playerRange(active.bgg)} · {playTime(active.bgg)}
          {active.bgg.minAge ? ` · ${active.bgg.minAge}+` : ""}
        </p>

        {!compact && active.bgg.description && (
          <p className="min-h-0 flex-1 overflow-hidden text-[11px] leading-relaxed text-gray-400">
            {stripBggHtml(active.bgg.description)}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function VariantChipStrip({
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
    <div
      className="scrollbar-hide -mx-1 flex shrink-0 items-center gap-1 overflow-x-auto px-1 pb-1"
      role="radiogroup"
      aria-label="Variant"
    >
      {members.map((m) => {
        const active = m.slug === activeSlug;
        const fits = fitsRange(m, minPlayers, maxPlayers);
        return (
          // biome-ignore lint/a11y/useSemanticElements: visually a button, semantically a radio — using <input> would drop the thumbnail+label chip layout
          <button
            key={m.slug}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`Show variant ${m.title}`}
            disabled={!interactive}
            onClick={(e) => {
              e.stopPropagation();
              if (interactive) onPick(m.slug);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className={`relative inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition ${
              active
                ? "text-white"
                : "border border-white/10 bg-surface-800/60 text-gray-300 hover:border-white/20 hover:text-white"
            } ${interactive ? "" : "opacity-90"}`}
            style={
              active
                ? {
                    backgroundColor: m.accentHex,
                    boxShadow: `0 0 0 1px ${m.accentHex}`,
                  }
                : undefined
            }
          >
            <img
              src={m.thumbnail}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-3.5 w-3.5 shrink-0 rounded-sm object-cover"
            />
            <span className="truncate">{m.family?.variant ?? m.title}</span>
            {!fits && interactive && (
              <span aria-hidden="true" className="text-[9px] opacity-60">
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
