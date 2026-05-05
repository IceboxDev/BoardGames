import type { CSSProperties } from "react";
import type { FamilyInfo } from "../games/families";
import type { GameDefinition } from "../games/types";

type Props = {
  family: FamilyInfo;
  /** Members from the input set actually visible — gates how many siblings
   * to show in the mini-strip and what the "+N variants" badge counts. */
  visibleMembers: GameDefinition[];
  expanded: boolean;
  onToggle: () => void;
  index?: number;
};

const MAX_THUMBS_IN_STRIP = 5;

export default function FamilyCard({
  family,
  visibleMembers,
  expanded,
  onToggle,
  index = 0,
}: Props) {
  const canonical = family.canonical;
  const ringMembers = visibleMembers.length;
  const overflow = visibleMembers.length - MAX_THUMBS_IN_STRIP;
  const stripMembers = visibleMembers.slice(0, MAX_THUMBS_IN_STRIP);

  const style: CSSProperties = {
    "--accent": canonical.accentHex,
    animationDelay: `${index * 80}ms`,
  } as CSSProperties;

  const className =
    "group relative flex flex-col overflow-hidden rounded-2xl border border-[var(--accent)]/30 bg-surface-900 " +
    "transition-all duration-300 animate-card-fade-up text-left " +
    "hover:border-[var(--accent)]/60 " +
    "hover:bg-[color-mix(in_srgb,var(--accent)_8%,var(--color-surface-900))] " +
    "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";

  return (
    <button
      type="button"
      onClick={onToggle}
      style={style}
      className={className}
      aria-expanded={expanded}
      aria-label={`${family.displayName} — ${ringMembers} variants. ${
        expanded ? "Collapse" : "Expand"
      }.`}
    >
      <div className="relative aspect-[16/9] overflow-hidden">
        {/* Ghost cards behind the canonical thumbnail — pure CSS, no extra
            HTTP requests. The two layers fan out a bit so the eye reads
            "stack" before it reads the badge. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 origin-bottom-left"
          style={{
            transform: "translate(12px, -8px) rotate(2deg) scale(0.86)",
            opacity: 0.25,
          }}
        >
          <span className="block h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-surface-800">
            {visibleMembers[2] && (
              <img
                src={visibleMembers[2].thumbnail}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            )}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 origin-bottom-left"
          style={{
            transform: "translate(6px, -4px) rotate(-1deg) scale(0.92)",
            opacity: 0.45,
          }}
        >
          <span className="block h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-surface-800">
            {visibleMembers[1] && (
              <img
                src={visibleMembers[1].thumbnail}
                alt=""
                aria-hidden="true"
                className="h-full w-full object-cover"
                loading="lazy"
                decoding="async"
              />
            )}
          </span>
        </span>
        {/* The actual canonical thumbnail sits on top. */}
        <img
          src={canonical.thumbnail}
          alt=""
          loading="lazy"
          decoding="async"
          className="relative h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/20 to-transparent" />
        <span
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] backdrop-blur-sm"
          style={{ color: canonical.accentHex }}
        >
          <StackIcon />+{ringMembers - 1} variants
        </span>
      </div>

      <div className="relative flex flex-1 flex-col gap-2 px-6 py-5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold text-gray-200 transition-colors group-hover:text-white">
            {family.displayName}
          </h3>
          <ChevronGlyph expanded={expanded} />
        </div>
        <p className="text-xs uppercase tracking-[0.18em] text-gray-500">
          {ringMembers} variants
          {visibleMembers[0]?.bgg.minPlayers && visibleMembers[0]?.bgg.maxPlayers
            ? ` · ${formatPlayerRange(visibleMembers)}`
            : ""}
        </p>

        {/* Mini-strip of variant thumbnails — gives the user a peek at the
            siblings without expanding. Canonical comes first; gets a tinted
            ring so the eye finds the "anchor" of the family. */}
        <div className="mt-1 flex items-center gap-1.5">
          {stripMembers.map((m) => {
            const isCanonical = m === canonical;
            return (
              <span
                key={m.slug}
                className={`relative h-8 w-8 shrink-0 overflow-hidden rounded-md bg-surface-800 ${
                  isCanonical ? "ring-2" : "ring-1 ring-white/10"
                }`}
                style={
                  isCanonical
                    ? ({ "--accent-ring": canonical.accentHex } as CSSProperties)
                    : undefined
                }
              >
                <img
                  src={m.thumbnail}
                  alt=""
                  aria-hidden="true"
                  className="h-full w-full object-cover"
                  loading="lazy"
                  decoding="async"
                />
                {isCanonical && (
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-md ring-2"
                    style={{
                      boxShadow: `inset 0 0 0 2px ${canonical.accentHex}`,
                    }}
                  />
                )}
              </span>
            );
          })}
          {overflow > 0 && (
            <span className="ml-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
              +{overflow}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function formatPlayerRange(members: GameDefinition[]): string {
  let lo = Number.POSITIVE_INFINITY;
  let hi = 0;
  for (const m of members) {
    if (m.bgg.minPlayers !== null && m.bgg.minPlayers < lo) lo = m.bgg.minPlayers;
    if (m.bgg.maxPlayers !== null && m.bgg.maxPlayers > hi) hi = m.bgg.maxPlayers;
  }
  if (lo === Number.POSITIVE_INFINITY || hi === 0) return "";
  if (lo === hi) return `${lo} players`;
  return `${lo}–${hi} players`;
}

function StackIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3 w-3"
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

function ChevronGlyph({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
      className={`h-4 w-4 shrink-0 text-gray-500 transition-transform duration-200 group-hover:text-[var(--accent)] ${
        expanded ? "rotate-180" : ""
      }`}
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 011.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z"
        clipRule="evenodd"
      />
    </svg>
  );
}
