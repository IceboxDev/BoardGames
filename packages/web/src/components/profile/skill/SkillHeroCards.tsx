import type { PlayerSkillResponse, ProfileMatchSummaryItem } from "@boardgames/core/protocol";
import type { ReactNode } from "react";
import { resolveGame } from "../../../lib/games-by-slug.ts";
import { FlameIcon } from "../../icons";
import { MicroLabel } from "../../ui/Label.tsx";
import { Surface } from "../../ui/Surface.tsx";
import { Medal } from "./Medal.tsx";
import { artHueFilter, claimArt, traitArt } from "./skill-card-art.ts";
import { bestGameFact, bestSkillFact, claimFact } from "./skill-page-facts.ts";
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {game && (
        <HeroCard label="Best game" art={gameDef?.thumbnail} artDim="opacity-40">
          <div className="mt-auto">
            <p className="text-xl font-black leading-tight text-white sm:text-2xl">
              {gameDef?.title ?? (game.kind === "most-played" ? game.title : game.slug)}
            </p>
            <p className="mt-1 text-2xs font-semibold uppercase tracking-pill text-fg-secondary">
              {game.kind === "ranked"
                ? `${ordinal(game.rank)} in the group · ${game.matches} games`
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
          art={claim.kind === "highlight" ? claimArt(claim.highlight) : undefined}
          artFilter={hueFilter}
        >
          <div className="mt-auto flex items-end justify-between gap-3">
            {claim.kind === "highlight" ? (
              <>
                <div className="min-w-0">
                  <p className="text-xl font-black leading-tight text-white sm:text-2xl">
                    {highlightCopy(claim.highlight).title}
                  </p>
                  <p className="mt-1 text-2xs font-semibold uppercase tracking-pill text-fg-secondary">
                    {highlightCopy(claim.highlight).detail}
                  </p>
                </div>
                <Medal highlight={claim.highlight} size="lg" />
              </>
            ) : claim.kind === "streak" ? (
              <>
                <div className="min-w-0">
                  <p className="text-xl font-black leading-tight text-white sm:text-2xl">
                    {claim.length}-game win streak
                  </p>
                  <p className="mt-1 text-2xs font-semibold uppercase tracking-pill text-fg-secondary">
                    Longest run of straight wins
                  </p>
                </div>
                <FlameIcon className="h-12 w-12 shrink-0 text-orange-300" />
              </>
            ) : (
              <>
                <div className="min-w-0">
                  <p className="text-xl font-black leading-tight text-white sm:text-2xl">
                    {claim.pct}% win rate
                  </p>
                  <p className="mt-1 text-2xs font-semibold uppercase tracking-pill text-fg-secondary">
                    {claim.wins} wins · {claim.losses} losses
                  </p>
                </div>
                <FlameIcon className="h-12 w-12 shrink-0 text-emerald-300" />
              </>
            )}
          </div>
        </HeroCard>
      )}
    </div>
  );
}
