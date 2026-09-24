import { helpCardDef } from "@boardgames/core/games/quiztopia/help-cards";
import { parseCardRef } from "@boardgames/core/games/quiztopia/ids";
import type { HelpCardId, QuiztopiaDeck } from "@boardgames/core/games/quiztopia/types";
import { TIP_CARDS_BY_TIER } from "@boardgames/core/games/quiztopia/types";
import {
  QUIZTOPIA_DIFFICULTIES,
  QUIZTOPIA_REQUIRED,
  quiztopiaLossAt,
} from "@boardgames/core/history/coop-challenge";
import type { QuiztopiaLanguage } from "@boardgames/core/protocol";

// Labels and small derivations shared by the lobby, board, rules and game
// over. Everything numeric comes from the core constants so the copy can
// never disagree with the engine.

/** Short tier labels for segmented controls ("Hölle ×3" for the triple). */
export const DIFFICULTY_SHORT: readonly string[] = QUIZTOPIA_DIFFICULTIES.map((d) =>
  d.startsWith("Hölle") ? "Hölle ×3" : d,
);

export interface TierFacts {
  label: string;
  required: number;
  lossAt: number;
  tips: number;
}

export function tierFacts(difficulty: number): TierFacts {
  const i = Math.min(Math.max(difficulty, 0), QUIZTOPIA_DIFFICULTIES.length - 1);
  return {
    label: QUIZTOPIA_DIFFICULTIES[i],
    required: QUIZTOPIA_REQUIRED[i],
    lossAt: quiztopiaLossAt(i),
    tips: TIP_CARDS_BY_TIER[i],
  };
}

export function deckLabel(deck: QuiztopiaDeck): string {
  return deck === "extended" ? "Extended" : "Original";
}

/** The board's local language: the room default, else English. */
export type BoardLanguage = QuiztopiaLanguage;

export function cycleLanguage(lang: BoardLanguage): BoardLanguage {
  return lang === "en" ? "de" : lang === "de" ? "both" : "en";
}

/** Which texts to show for a language choice, primary first. */
export function pickTexts(lang: BoardLanguage, en: string, de: string): string[] {
  if (lang === "en") return [en];
  if (lang === "de") return [de];
  return en === de ? [en] : [en, de];
}

/**
 * The editor's notes a reader sees: the language's own note, or — showing
 * both languages — both, deduplicated (a neutral note is carried in both
 * fields as faithful translations, so an identical pair collapses to one).
 */
export function pickNotes(
  lang: BoardLanguage,
  notesEn: string | undefined,
  notesDe: string | undefined,
): { lang: "en" | "de"; text: string }[] {
  const en = (notesEn ?? "").trim();
  const de = (notesDe ?? "").trim();
  const out: { lang: "en" | "de"; text: string }[] = [];
  if (lang !== "de" && en) out.push({ lang: "en", text: en });
  if (lang !== "en" && de && !(lang === "both" && de === en)) out.push({ lang: "de", text: de });
  return out;
}

/** "de.wikipedia.org" for a source URL (the URL itself when it does not parse). */
export function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** "c042 · Q3" for the original card, "c042-v2 · Q3" for a virtual one. */
export function cardRefLabel(cardRef: string, categoryIndex: number): string {
  return `${cardRef} · Q${categoryIndex + 1}`;
}

/** The wiki route for a question's set — from a card ref, not a question id,
 *  so fixture refs simply yield null. */
export function wikiPathFor(cardRef: string, categorySlug: string): string | null {
  const parsed = parseCardRef(cardRef);
  if (!parsed) return null;
  return `/play/quiztopia/solo/wiki/${categorySlug}/${parsed.cardId}`;
}

/**
 * Rulings the table forgets: alternatives separated by "/" are all accepted,
 * and a person's surname is enough. Heuristic on the answer text only.
 */
export function answerHints(answer: string): string[] {
  const hints: string[] = [];
  if (answer.includes("/")) hints.push("Any one of the alternatives counts.");
  const words = answer.trim().split(/\s+/);
  const looksLikeName =
    words.length >= 2 &&
    words.length <= 4 &&
    !/\d/.test(answer) &&
    !answer.includes("/") &&
    words.every(
      (w) => /^[A-ZÄÖÜ][\p{L}'’.-]*$/u.test(w) || /^(de|van|von|der|di|da|le|la)$/i.test(w),
    );
  if (looksLikeName) hints.push("The surname alone is enough.");
  return hints;
}

/** A help card's name for a board language: "Occupation · Besetzung" in Both. */
export function helpCardName(id: HelpCardId, lang: BoardLanguage): string {
  const def = helpCardDef(id);
  if (lang === "de") return def.nameDe;
  if (lang === "en") return def.nameEn;
  return def.nameEn === def.nameDe ? def.nameEn : `${def.nameEn} · ${def.nameDe}`;
}
