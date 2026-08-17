// Background art for the showcase cards, discovered at build time. Drop the
// generated images into `assets/` with these exact names and the cards pick
// them up — missing files degrade gracefully to the accent-glow fallback.
// Prompts for generating the images: `assets/PROMPTS.md`.
//
//   bg-int.webp  bg-pln.webp  bg-per.webp  bg-soph.webp  bg-soc.webp  bg-dex.webp
//   bg-claim-gold.webp  bg-claim-silver.webp  bg-claim-bronze.webp
//   bg-claim-streak.webp  bg-claim-winrate.webp  bg-claim-coop.webp
//   bg-claim-form.webp  bg-claim-variety.webp  bg-claim-dedication.webp

import type { SkillTraitId } from "@boardgames/core/protocol";
import type { ClaimFact } from "./skill-page-facts.ts";

const art = import.meta.glob("./assets/bg-*.{webp,png,jpg}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function find(stem: string): string | undefined {
  return art[`./assets/${stem}.webp`] ?? art[`./assets/${stem}.png`] ?? art[`./assets/${stem}.jpg`];
}

export function traitArt(trait: SkillTraitId): string | undefined {
  return find(`bg-${trait}`);
}

/**
 * Custom claim-card emblems (hand-made artwork, like the trophies and the
 * flame) — drop `emblem-coop.svg`, `emblem-variety.svg` and
 * `emblem-dedication.svg` into assets/ and they replace the stock icons.
 * Rendered as-is (no re-hue), same as the trophies.
 */
const emblems = import.meta.glob("./assets/emblem-*.{svg,webp,png}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

export function claimEmblemArt(kind: "coop" | "variety" | "dedication"): string | undefined {
  return (
    emblems[`./assets/emblem-${kind}.svg`] ??
    emblems[`./assets/emblem-${kind}.webp`] ??
    emblems[`./assets/emblem-${kind}.png`]
  );
}

/**
 * The indigo the generated background sets are ambient in (#6366f1 glows on
 * near-black — measured ≈229–239° across the trait set; the claim set shares
 * the same indigo ambience under its warm glow). A single CSS hue-rotate from
 * here re-hues the scene to the profile accent while black stays black — and
 * an indigo-accent profile keeps the untouched original.
 */
const ART_BASE_HUE = 232;

function hexToHue(hex: string): number | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = Number.parseInt(m[1], 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 0.03) return null; // grey accent — no meaningful hue to rotate to
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/**
 * CSS filter that re-hues generated card art to the profile accent. Undefined
 * when the accent is missing, grey, or already indigo-ish.
 */
export function artHueFilter(accentHex: string | null | undefined): string | undefined {
  if (!accentHex) return undefined;
  const hue = hexToHue(accentHex);
  if (hue === null) return undefined;
  let delta = Math.round(hue - ART_BASE_HUE);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  if (Math.abs(delta) < 8) return undefined;
  return `hue-rotate(${delta}deg)`;
}

/**
 * Accent re-hue for the claim card's art. Podium (trophy-metal) art always
 * returns undefined — the metal IS the meaning. The other six claim images
 * rotate from the SAME indigo base as the trait set: their scenes are
 * indigo-ambient with a warm glow, and anchoring to the ambience keeps an
 * indigo-accent profile on the untouched original (anchoring to the warm glow
 * instead spun the ambience green — Aydan's bug).
 */
export function claimArtFilter(
  claim: ClaimFact,
  accentHex: string | null | undefined,
): string | undefined {
  if (claim.kind === "highlight") return undefined;
  return artHueFilter(accentHex);
}

export function claimArt(claim: ClaimFact): string | undefined {
  if (claim.kind === "highlight") {
    const h = claim.highlight;
    const tier =
      h.kind === "trait-first" || h.kind === "game-first"
        ? "gold"
        : h.kind === "trait-top3"
          ? h.rank === 2
            ? "silver"
            : "bronze"
          : "gold";
    return find(`bg-claim-${tier}`);
  }
  const key: Record<Exclude<ClaimFact["kind"], "highlight">, string> = {
    streak: "streak",
    winrate: "winrate",
    "coop-wins": "coop",
    "coop-score": "coop",
    form: "form",
    variety: "variety",
    dedication: "dedication",
  };
  return find(`bg-claim-${key[claim.kind]}`);
}
