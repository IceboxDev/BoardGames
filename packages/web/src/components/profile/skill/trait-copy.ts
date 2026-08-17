// Display copy for the six skill traits and the highlight ladder. Pure data +
// formatters, no React — every string stays a checkable restatement of the
// server-derived fact it renders (no invented superlatives beyond rank 1).

import type { SkillHighlightWire, SkillTraitId } from "@boardgames/core/protocol";
import { resolveGame } from "../../../lib/games-by-slug.ts";

export const TRAIT_COPY: Record<SkillTraitId, { label: string; blurb: string }> = {
  int: {
    label: "Intelligence",
    blurb: "Reasoning, calculation, deduction — how effectively you figure things out.",
  },
  pln: {
    label: "Planning",
    blurb: "Strategy across future turns — turning present decisions into future advantage.",
  },
  per: {
    label: "Perception",
    blurb: "Pattern spotting and scanning — how effectively you notice what is there.",
  },
  soph: {
    label: "Sophistication",
    blurb: "Vocabulary, knowledge, references — how rich your pool of concepts is.",
  },
  soc: {
    label: "Social",
    blurb: "Reading, predicting and influencing people — operating through others.",
  },
  dex: {
    label: "Dexterity",
    blurb: "Physical precision, speed and control — executing what you intend.",
  },
};

export function traitLabel(trait: SkillTraitId): string {
  return TRAIT_COPY[trait].label;
}

function gameTitle(slug: string): string {
  return resolveGame(slug)?.title ?? slug;
}

/** Headline + supporting line for one highlight. */
export function highlightCopy(h: SkillHighlightWire): { title: string; detail: string } {
  switch (h.kind) {
    case "trait-first":
      return {
        title: `Best ${traitLabel(h.trait)} in the group`,
        detail: `#1 on the ${traitLabel(h.trait)} leaderboard`,
      };
    case "trait-top3":
      return {
        title: `Top in ${traitLabel(h.trait)}`,
        detail: `#${h.rank} on the ${traitLabel(h.trait)} leaderboard`,
      };
    case "game-first":
      return {
        title: `Best ${gameTitle(h.slug)} player`,
        detail: `#1 rated over ${h.matches} recorded matches`,
      };
    case "trait-strong":
      return {
        title: `Strong ${traitLabel(h.trait)}`,
        detail: `Score ${h.score} of 100`,
      };
    case "top-trait":
      return {
        title: `Strongest axis: ${traitLabel(h.trait)}`,
        detail: `Score ${h.score} of 100 — your best trait`,
      };
  }
}

export function ordinal(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem10 === 1 && rem100 !== 11) return `${n}st`;
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
  return `${n}th`;
}
