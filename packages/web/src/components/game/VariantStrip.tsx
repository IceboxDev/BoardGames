import type { GameDefinition } from "../../games/types";
import { fitsRange } from "../../lib/bgg-format";

// Vertical strip of circular variant thumbnails ("rim discs") that lets the
// user swap which member of a family is active inside the parent card.
// Shared by `OnlineFamilyCard` (catalog grid) and `FamilyCarouselCard`
// (offline carousel). Renders as a radio group; the active disc gets an
// accent-colored glow ring while the others get a subtle white outline.
//
// `interactive` lets the carousel disable the buttons on off-center cards
// (so users can't accidentally swap variants on a card they can't see).
// `fitWindow` overlays a ✕ mask on members whose published player count
// can't accommodate the given headcount window — surfaced as a hint when
// switching from the canonical to a sibling that won't actually fit.

type Props = {
  members: GameDefinition[];
  activeSlug: string;
  onPick: (slug: string) => void;
  /** Defaults to true. When false, every disc is `disabled` and unclickable. */
  interactive?: boolean;
  /**
   * Player-count window from the surrounding game night. When provided,
   * members whose `[minPlayers, maxPlayers]` range doesn't overlap with
   * `[lo, hi]` get a ✕ mask. Omitted in the catalog grid (no game night
   * context exists there).
   */
  fitWindow?: { lo: number; hi: number };
};

export function VariantStrip({
  members,
  activeSlug,
  onPick,
  interactive = true,
  fitWindow,
}: Props) {
  return (
    <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="Variant">
      {members.map((m) => {
        const isActive = m.slug === activeSlug;
        const fits = fitWindow ? fitsRange(m, fitWindow.lo, fitWindow.hi) : true;
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
            disabled={!interactive}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (interactive) onPick(m.slug);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            className={`relative h-7 w-7 shrink-0 overflow-hidden rounded-full transition-transform ${
              isActive ? "scale-110" : "hover:scale-105"
            } ${interactive ? "" : "opacity-90"}`}
            style={{
              boxShadow: isActive
                ? `0 0 0 2px ${m.accentHex}, 0 0 10px ${m.accentHex}99`
                : "0 0 0 1px rgba(255,255,255,0.35), 0 0 6px rgba(0,0,0,0.6)",
              opacity: isActive ? 1 : interactive ? 0.85 : 0.9,
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
                className="absolute inset-0 flex items-center justify-center bg-black/55 text-3xs font-bold text-white/80"
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
