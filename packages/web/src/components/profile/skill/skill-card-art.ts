// Background art for the showcase cards, discovered at build time. Drop the
// generated images into `assets/` with these exact names and the cards pick
// them up — missing files degrade gracefully to the accent-glow fallback.
// Prompts for generating the images: `assets/PROMPTS.md`.
//
//   bg-int.webp  bg-pln.webp  bg-per.webp  bg-soph.webp  bg-soc.webp  bg-dex.webp
//   bg-claim-gold.webp  bg-claim-silver.webp  bg-claim-bronze.webp

import type { SkillHighlightWire, SkillTraitId } from "@boardgames/core/protocol";

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
 * The hue the background art was generated around (indigo #6366f1 glows on
 * near-black — measured ≈229–239° across the set). Because the images are
 * essentially monochromatic light-on-black, a single CSS hue-rotate re-hues
 * every glow, spark and beam to the profile accent while black stays black.
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
 * CSS filter that re-hues the (indigo-based) card art to the profile accent.
 * Undefined when the accent is missing, grey, or already indigo-ish.
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

export function claimArt(highlight: SkillHighlightWire): string | undefined {
  const tier =
    highlight.kind === "trait-first" || highlight.kind === "game-first"
      ? "gold"
      : highlight.kind === "trait-top3"
        ? highlight.rank === 2
          ? "silver"
          : "bronze"
        : "gold";
  return find(`bg-claim-${tier}`);
}
