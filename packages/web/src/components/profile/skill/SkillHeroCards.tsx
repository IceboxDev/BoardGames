import type { PlayerSkillResponse, ProfileMatchSummaryItem } from "@boardgames/core/protocol";
import type { ReactNode } from "react";
import { cn } from "../../../lib/cn.ts";
import { resolveGame } from "../../../lib/games-by-slug.ts";
import { ClockIcon, GalleryIcon, UsersIcon } from "../../icons";
import { FlameArt } from "../../ui/FlameArt.tsx";
import { MicroLabel } from "../../ui/Label.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { Medal } from "./Medal.tsx";
import { artHueFilter, claimArt, claimArtFilter, traitArt } from "./skill-card-art.ts";
import { bestGameFact, bestSkillFact, type ClaimFact, claimFact } from "./skill-page-facts.ts";
import { TraitIcon } from "./TraitIcon.tsx";
import { highlightCopy, ordinal, TRAIT_COPY } from "./trait-copy.ts";

// The hero triptych: exactly three "best true things" about the player,
// playing the page's central visual role — tall cards with full-bleed art
// (game art / per-trait art / podium art, see skill-card-art.ts), display
// typography, and deliberately unconstrained copy ("1st in the group", never
// "of N"). Pickers live in skill-page-facts.ts; nothing here invents facts.

function HeroCard({
  label,
  children,
  art,
  artDim = "opacity-35",
  artFilter,
}: {
  label: string;
  children: ReactNode;
  /** Full-bleed background image URL; falls back to an accent glow. */
  art?: string;
  artDim?: string;
  /** CSS filter re-hueing generated art to the profile accent (not box art). */
  artFilter?: string;
}) {
  return (
    <Surface
      variant="raised"
      padding="none"
      className="relative min-h-[11rem] overflow-hidden p-5 sm:min-h-[12rem]"
    >
      {art ? (
        <>
          <img
            src={art}
            alt=""
            className={`absolute inset-0 h-full w-full object-cover ${artDim}`}
            style={artFilter ? { filter: artFilter } : undefined}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-surface-950/95 via-surface-950/55 to-surface-950/25" />
        </>
      ) : (
        <div className="pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-[var(--accent)]/20 blur-3xl" />
      )}
      <div className="relative flex h-full min-h-[8.5rem] flex-col sm:min-h-[9.5rem]">
        <MicroLabel className="font-semibold text-fg-secondary">{label}</MicroLabel>
        {children}
      </div>
    </Surface>
  );
}

/** SVG progress ring with the 1–100 score centered. */
function ScoreRing({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="h-20 w-20 shrink-0 -rotate-90" role="img">
      <title>{`Score ${score} of 100`}</title>
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="currentColor"
        className="text-white/10"
        strokeWidth="6"
      />
      <circle
        cx="32"
        cy="32"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray={`${(score / 100) * c} ${c}`}
      />
      <text
        x="32"
        y="33"
        textAnchor="middle"
        dominantBaseline="middle"
        transform="rotate(90 32 32)"
        className="fill-white text-lg font-black tabular-nums"
      >
        {score}
      </text>
    </svg>
  );
}

export function SkillHeroCards({
  skill,
  summaryItems,
  accentHex,
}: {
  skill: PlayerSkillResponse;
  summaryItems: readonly ProfileMatchSummaryItem[] | undefined;
  accentHex?: string | null;
}) {
  const game = bestGameFact(skill, summaryItems);
  const best = bestSkillFact(skill);
  const claim = claimFact(
    skill,
    summaryItems,
    game?.kind === "ranked" ? game.slug : null,
    best?.trait ?? null,
  );

  const gameDef = game ? resolveGame(game.slug) : undefined;
  // Generated art (trait/claim) re-hues to the profile accent; licensed game
  // box art stays untouched.
  const hueFilter = artHueFilter(accentHex);

  return (
    // md, not sm: three-up below ~768px leaves too little width for the
    // one-line claim titles.
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {game && (
        <HeroCard label="Best game" art={gameDef?.thumbnail} artDim="opacity-40">
          <div className="mt-auto">
            <p className="text-xl font-black leading-tight text-white sm:text-2xl">
              {gameDef?.title ?? (game.kind === "most-played" ? game.title : game.slug)}
            </p>
            <p className="mt-1 text-2xs font-semibold uppercase tracking-pill text-fg-secondary">
              {game.kind === "ranked"
                ? `${game.rank === 1 ? "Best" : `${ordinal(game.rank)} best`} in the group · ${game.matches} games`
                : `Most played · ${game.plays} games`}
            </p>
          </div>
        </HeroCard>
      )}

      {best && (
        <HeroCard label="Best skill" art={traitArt(best.trait)} artFilter={hueFilter}>
          <div className="mt-auto flex items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-xl font-black leading-tight text-white sm:text-2xl">
                <TraitIcon trait={best.trait} className="h-5 w-5 shrink-0 text-[var(--accent)]" />
                {TRAIT_COPY[best.trait].label}
              </p>
              <p className="mt-1 text-2xs font-semibold uppercase tracking-pill text-fg-secondary">
                {best.provisional ? "Provisional — needs more games" : `Score ${best.score} of 100`}
              </p>
            </div>
            <ScoreRing score={best.score} />
          </div>
        </HeroCard>
      )}

      {claim && (
        <HeroCard
          label="Claim to fame"
          art={claimArt(claim)}
          artFilter={claimArtFilter(claim, accentHex)}
        >
          {/* Emblem rides top-right so the title owns the full card width and
              stays on ONE line even for "Sophistication Champion". */}
          <div className="absolute right-0 top-0">
            <ClaimEmblem claim={claim} accentHex={accentHex} />
          </div>
          <div className="mt-auto">
            <p
              className={cn(
                "font-black leading-tight text-white",
                claimCopy(claim).title.length > 16 ? "text-lg lg:text-xl" : "text-xl sm:text-2xl",
              )}
            >
              {claimCopy(claim).title}
            </p>
            <p className="mt-1 text-2xs font-semibold uppercase tracking-pill text-fg-secondary">
              {claimCopy(claim).detail}
            </p>
          </div>
        </HeroCard>
      )}
    </div>
  );
}

/** One-line, unapologetically flattering copy for every claim kind. */
function claimCopy(claim: ClaimFact): { title: string; detail: string } {
  switch (claim.kind) {
    case "highlight":
      return highlightCopy(claim.highlight);
    case "streak":
      return { title: `${claim.length}-win streak`, detail: "Straight wins, no mercy" };
    case "winrate":
      return {
        title: `${claim.pct}% win rate`,
        detail: `${claim.wins} wins · a winning record`,
      };
    case "coop-wins":
      return { title: "Team player", detail: `${claim.wins} co-op victories` };
    case "coop-score":
      return {
        title: claim.max
          ? `${claim.score}/${claim.max} in ${claim.title}`
          : `Scored ${claim.score} in ${claim.title}`,
        detail: "Best team score on record",
      };
    case "form":
      return {
        title: "On fire right now",
        detail: `${claim.wins} of the last ${claim.window} won`,
      };
    case "variety":
      return { title: "The Explorer", detail: `${claim.games} different games played` };
    case "dedication":
      return { title: `${claim.games} games strong`, detail: "Always at the table" };
  }
}

/** The claim card's right-side emblem — trophy for podium claims, the
 *  accent-tinted flame for hot facts, themed icons for the rest. */
function ClaimEmblem({ claim, accentHex }: { claim: ClaimFact; accentHex?: string | null }) {
  switch (claim.kind) {
    case "highlight":
      return <Medal highlight={claim.highlight} size="lg" />;
    case "streak":
    case "form":
    case "winrate":
      return <FlameArt className="h-12 w-12" accentHex={accentHex} />;
    case "coop-wins":
    case "coop-score":
      return <UsersIcon className="h-10 w-10 shrink-0 text-[var(--accent)]" />;
    case "variety":
      return <GalleryIcon className="h-10 w-10 shrink-0 text-[var(--accent)]" />;
    case "dedication":
      return <ClockIcon className="h-10 w-10 shrink-0 text-[var(--accent)]" />;
  }
}
