import { type CSSProperties, useState } from "react";
import { Link } from "react-router-dom";
import type { FamilyInfo } from "../games/families";
import type { BggGame, GameDefinition } from "../games/types";
import { StarIcon } from "./icons";

type Props = {
  family: FamilyInfo;
  visibleMembers: GameDefinition[];
  index?: number;
  showComingSoon?: boolean;
};

/**
 * Online-gallery counterpart of `FamilyCarouselCard`: one card per family,
 * with the same disc-thumbnail switcher straddling the left edge. The active
 * variant drives the title, thumbnail, summary, BGG meta, and the play
 * destination — clicking the card body navigates to `/play/<activeSlug>` if
 * the variant has a playable component, otherwise the card is non-link and
 * shows the "Coming soon" badge.
 */
export default function OnlineFamilyCard({
  family,
  visibleMembers,
  index = 0,
  showComingSoon = true,
}: Props) {
  const initialSlug =
    visibleMembers.find((m) => m === family.canonical)?.slug ?? visibleMembers[0]?.slug;
  const [activeSlug, setActiveSlug] = useState<string>(initialSlug);
  const active = visibleMembers.find((m) => m.slug === activeSlug) ?? visibleMembers[0];

  const summary = compactSummary(active.bgg);
  const description = active.bgg.description;
  const href = active.component ? `/play/${active.slug}` : undefined;
  const style: CSSProperties = {
    "--accent": active.accentHex,
    animationDelay: `${index * 80}ms`,
  } as CSSProperties;

  const cardClassName =
    "group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-900 " +
    "transition-all duration-300 " +
    "hover:border-[var(--accent)]/40 " +
    "hover:bg-[color-mix(in_srgb,var(--accent)_8%,var(--color-surface-900))]";

  const inner = (
    <>
      <div className="relative aspect-[16/9] overflow-hidden">
        <img
          src={active.thumbnail}
          alt=""
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-surface-900 via-surface-900/20 to-transparent" />
        <span
          className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] backdrop-blur-sm"
          style={{ color: family.canonical.accentHex }}
        >
          <StackIcon />
          {visibleMembers.length} variants
        </span>
        {showComingSoon && !active.component && (
          <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.2em] text-white/75 backdrop-blur-sm">
            Coming soon
          </span>
        )}
      </div>

      <div className="relative flex flex-1 flex-col gap-2 px-6 py-5">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold text-gray-200 transition-colors group-hover:text-white">
            {active.title}
          </h3>
          {href && (
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4 shrink-0 text-gray-600 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--accent)]"
            >
              <path
                fillRule="evenodd"
                d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z"
                clipRule="evenodd"
              />
            </svg>
          )}
        </div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-gray-500">
          {family.displayName} · {active.family?.variant ?? "Variant"}
        </p>
        {summary && <p className="text-xs uppercase tracking-[0.18em] text-gray-500">{summary}</p>}
        {description && (
          <p className="line-clamp-6 flex-1 text-sm leading-relaxed text-gray-400">{description}</p>
        )}
        <BggMeta bgg={active.bgg} />
      </div>
    </>
  );

  return (
    <div
      style={style}
      className="relative animate-card-fade-up"
      // Animation delay lives on the wrapper, animation class too — the inner
      // Link can't host the absolutely-positioned rim discs without clipping
      // them, so it stays opaque and the wrapper handles entry.
    >
      {href ? (
        <Link to={href} className={cardClassName}>
          {inner}
        </Link>
      ) : (
        <div className={cardClassName}>{inner}</div>
      )}

      {/* Variant rim discs — straddling the LEFT BORDER of the thumbnail
          area, mirroring the offline carousel's switcher. Sits OUTSIDE the
          overflow-hidden card frame; the absolute overlay matches the
          thumbnail's 16:9 box so flex-center aligns the strip on its
          midline. */}
      <div className="pointer-events-none absolute left-0 top-0 z-20 aspect-[16/9] w-full">
        <div className="flex h-full items-center">
          <div className="-translate-x-3.5 pointer-events-auto">
            <VariantChipStrip
              members={visibleMembers}
              activeSlug={active.slug}
              onPick={setActiveSlug}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function VariantChipStrip({
  members,
  activeSlug,
  onPick,
}: {
  members: GameDefinition[];
  activeSlug: string;
  onPick: (slug: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Variant">
      {members.map((m) => {
        const isActive = m.slug === activeSlug;
        const variantLabel = m.family?.variant ?? m.title;
        return (
          // biome-ignore lint/a11y/useSemanticElements: visually a button, semantically a radio — keeps the thumbnail-disc layout
          <button
            key={m.slug}
            type="button"
            role="radio"
            aria-checked={isActive}
            aria-label={`Show variant ${m.title}`}
            title={variantLabel}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPick(m.slug);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className={`relative h-7 w-7 shrink-0 overflow-hidden rounded-full transition-transform ${
              isActive ? "scale-110" : "hover:scale-105"
            }`}
            style={{
              boxShadow: isActive
                ? `0 0 0 2px ${m.accentHex}, 0 0 10px ${m.accentHex}99`
                : "0 0 0 1px rgba(255,255,255,0.35), 0 0 6px rgba(0,0,0,0.6)",
              opacity: isActive ? 1 : 0.85,
            }}
          >
            <img
              src={m.thumbnail}
              alt=""
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover"
            />
          </button>
        );
      })}
    </div>
  );
}

function compactSummary(bgg: BggGame): string {
  const parts: string[] = [];
  if (bgg.yearPublished) parts.push(String(bgg.yearPublished));
  if (bgg.minPlayers && bgg.maxPlayers) {
    const maxLabel = bgg.maxPlayers === "infinity" ? "∞" : String(bgg.maxPlayers);
    parts.push(
      bgg.minPlayers === bgg.maxPlayers
        ? `${bgg.minPlayers} players`
        : `${bgg.minPlayers}–${maxLabel} players`,
    );
  }
  if (bgg.playingTime) parts.push(`${bgg.playingTime} min`);
  return parts.join(" · ");
}

function weightLabel(w: number): string {
  if (w < 2) return "Light";
  if (w < 3) return "Medium-light";
  if (w < 3.5) return "Medium";
  if (w < 4) return "Medium-heavy";
  return "Heavy";
}

function BggMeta({ bgg }: { bgg: BggGame }) {
  const hasRating = bgg.averageRating !== null;
  const hasWeight = bgg.averageWeight !== null && bgg.averageWeight > 0;
  if (!hasRating && !hasWeight) return null;

  return (
    <div className="mt-3 flex flex-col gap-2 border-t border-white/[0.05] pt-3 text-[11px] text-gray-400">
      {hasRating && bgg.averageRating !== null && (
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <StarIcon className="h-3.5 w-3.5 text-amber-400" />
            <span className="font-semibold text-gray-200">{bgg.averageRating.toFixed(1)}</span>
            <span className="text-gray-500">/ 10</span>
          </span>
          {bgg.numRatings ? (
            <span className="text-[10px] text-gray-500">{formatCount(bgg.numRatings)} ratings</span>
          ) : null}
        </div>
      )}
      {hasWeight && bgg.averageWeight !== null && (
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-gray-500">
            Complexity
          </span>
          <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[var(--accent)] transition-[width] duration-500"
              style={{ width: `${Math.min(100, (bgg.averageWeight / 5) * 100)}%` }}
            />
          </div>
          <span className="shrink-0 font-semibold text-gray-200 tabular-nums">
            {bgg.averageWeight.toFixed(1)}
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-gray-500">
            {weightLabel(bgg.averageWeight)}
          </span>
        </div>
      )}
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(n);
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
