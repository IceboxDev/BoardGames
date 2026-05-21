import type { CSSProperties } from "react";
import type { FamilyInfo } from "../games/families";
import type { GameDefinition } from "../games/types";
import { GameCardBody, GameCardChrome, GameCardMeta, GameCardThumb, VariantsBadge } from "./game";

type Props = {
  family: FamilyInfo;
  /**
   * Members from the input set actually visible — gates how many siblings
   * to show in the mini-strip and what the "+N variants" badge counts.
   */
  visibleMembers: GameDefinition[];
  expanded: boolean;
  onToggle: () => void;
  index?: number;
};

const MAX_THUMBS_IN_STRIP = 5;

/**
 * Gallery family-stack card: collapsed view of a multi-member family with
 * a ghost-card thumbnail stack behind the canonical, plus a mini variant
 * strip below the title. Clicking the card toggles the expanded grid
 * elsewhere (the gallery page renders the family's members in a row when
 * expanded; this card is the collapsed/header state).
 */
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

  return (
    <GameCardChrome
      accentHex={canonical.accentHex}
      index={index}
      as={{
        kind: "button",
        onClick: onToggle,
        ariaExpanded: expanded,
        ariaLabel: `${family.displayName} — ${ringMembers} variants. ${
          expanded ? "Collapse" : "Expand"
        }.`,
      }}
    >
      <GameCardThumb
        src={canonical.thumbnail}
        backdrop={<FamilyGhostBackdrop visibleMembers={visibleMembers} />}
        badgeTopRight={
          <VariantsBadge count={ringMembers} accentHex={canonical.accentHex} mode="plus" />
        }
        noHoverScale
      />
      <GameCardBody title={family.displayName} affordance={{ kind: "chevron", expanded }}>
        <GameCardMeta>
          {ringMembers} variants
          {visibleMembers[0]?.bgg.minPlayers && visibleMembers[0]?.bgg.maxPlayers
            ? ` · ${formatPlayerRange(visibleMembers)}`
            : ""}
        </GameCardMeta>

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
                    style={{ boxShadow: `inset 0 0 0 2px ${canonical.accentHex}` }}
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
      </GameCardBody>
    </GameCardChrome>
  );
}

/**
 * Ghost cards behind the canonical thumbnail — pure CSS, no extra HTTP
 * requests. The two layers fan out a bit so the eye reads "stack" before
 * it reads the badge. Lives inside `GameCardThumb`'s `backdrop` slot.
 */
function FamilyGhostBackdrop({ visibleMembers }: { visibleMembers: GameDefinition[] }) {
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 origin-bottom-left"
        style={{ transform: "translate(12px, -8px) rotate(2deg) scale(0.86)", opacity: 0.25 }}
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
        style={{ transform: "translate(6px, -4px) rotate(-1deg) scale(0.92)", opacity: 0.45 }}
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
    </>
  );
}

function formatPlayerRange(members: GameDefinition[]): string {
  let lo = Number.POSITIVE_INFINITY;
  let hi = 0;
  let unbounded = false;
  for (const m of members) {
    if (m.bgg.minPlayers !== null && m.bgg.minPlayers < lo) lo = m.bgg.minPlayers;
    const max = m.bgg.maxPlayers;
    if (max === "infinity") unbounded = true;
    else if (max !== null && max > hi) hi = max;
  }
  if (lo === Number.POSITIVE_INFINITY) return "";
  if (unbounded) return `${lo}–∞ players`;
  if (hi === 0) return "";
  if (lo === hi) return `${lo} players`;
  return `${lo}–${hi} players`;
}
