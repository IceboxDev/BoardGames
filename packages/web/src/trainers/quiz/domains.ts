// The quiz platform's domains as the app draws them: the core taxonomy
// (`@boardgames/core/quiz/taxonomy`) plus a display tone and a two-digit
// label. Tones repeat — there are more domains than hues — and every class
// is a full literal so Tailwind sees it.

import { QUIZ_DOMAINS, type QuizDomain } from "@boardgames/core/quiz/taxonomy";
import type { CoreTone, Tone } from "../../components/ui";

export type DomainTone = Exclude<Tone, "neutral">;

const TONES: Record<string, DomainTone> = {
  "music-stage": "rose",
  "film-media": "orange",
  literature: "amber",
  art: "purple",
  everyday: "rose",
  "sport-games": "emerald",
  history: "amber",
  society: "sky",
  belief: "purple",
  science: "cyan",
  "earth-space": "sky",
  nature: "emerald",
  technology: "cyan",
  geography: "accent",
};

export interface Domain extends QuizDomain {
  /** Two-digit label printed in the domain's bubble ("07"). */
  label: string;
  tone: DomainTone;
}

export const DOMAINS: readonly Domain[] = QUIZ_DOMAINS.map((d) => ({
  ...d,
  label: String(d.n).padStart(2, "0"),
  tone: TONES[d.slug] ?? "accent",
}));

const FALLBACK: Domain = { ...DOMAINS[0], tone: "accent" };

export function domainOf(slug: string | null | undefined): Domain {
  return DOMAINS.find((d) => d.slug === slug) ?? FALLBACK;
}

export function findDomain(slug: string | null | undefined): Domain | undefined {
  return DOMAINS.find((d) => d.slug === slug);
}

export function subName(domain: Domain, sub: string, lang: "en" | "de" | "ru" = "en"): string {
  const s = domain.subs.find((x) => x.slug === sub);
  return s ? s[lang] : sub;
}

/** Thin coloured strip along a card's top edge. */
export const TONE_STRIP: Record<DomainTone, string> = {
  accent: "bg-accent-400",
  amber: "bg-amber-400",
  sky: "bg-sky-400",
  emerald: "bg-emerald-400",
  rose: "bg-rose-400",
  purple: "bg-purple-400",
  orange: "bg-orange-400",
  cyan: "bg-cyan-400",
};

/** Answer highlight inside running text. */
export const TONE_MARK: Record<DomainTone, string> = {
  accent: "bg-accent-400/25",
  amber: "bg-amber-400/25",
  sky: "bg-sky-400/25",
  emerald: "bg-emerald-400/25",
  rose: "bg-rose-400/25",
  purple: "bg-purple-400/25",
  orange: "bg-orange-400/25",
  cyan: "bg-cyan-400/25",
};

/** A tile's edge when its domain has nothing due. */
export const TONE_LIT: Record<DomainTone, string> = {
  accent: "border-accent-400/40 shadow-glow-accent",
  amber: "border-amber-400/40 shadow-glow-amber",
  sky: "border-sky-400/40 shadow-glow-sky",
  emerald: "border-emerald-400/40 shadow-glow-emerald",
  rose: "border-rose-400/40 shadow-glow-rose",
  purple: "border-purple-400/40",
  orange: "border-orange-400/40",
  cyan: "border-cyan-400/40 shadow-glow-cyan",
};

const CORE_TONES: readonly CoreTone[] = ["accent", "amber", "sky", "emerald", "rose"];

/** The nearest interactive tone, for controls (Chip) that only take the core set. */
export function coreToneOf(tone: DomainTone): CoreTone {
  return CORE_TONES.find((t) => t === tone) ?? "accent";
}
