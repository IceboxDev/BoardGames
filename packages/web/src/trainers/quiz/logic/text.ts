import type { QuizLang, QuizLanguages } from "@boardgames/core/protocol";
import { fieldIn, inLang, inLangs } from "@boardgames/core/quiz/text";

// The trainer's one way of picking text by language (core `quiz/text.ts`):
// a single language for a field, or the reader's main + second language
// for questions and answers. Russian falls back to English where the bank
// has none yet.

export { fieldIn, inLang, inLangs };

/** The editor's notes a reader sees, one per language on screen, identical ones once. */
export function notesIn(
  langs: QuizLanguages,
  notes: { en: string | undefined; de: string | undefined; ru?: string | undefined },
): { lang: QuizLang; text: string }[] {
  const out: { lang: QuizLang; text: string }[] = [];
  for (const lang of [langs.primary, langs.secondary]) {
    if (!lang) continue;
    const text = (notes[lang] ?? "").trim();
    if (text && !out.some((n) => n.text === text)) out.push({ lang, text });
  }
  return out;
}

/** The report form's default "which language": the main one, or "both" when two are on screen. */
export function reportLanguageOf(langs: QuizLanguages): QuizLang | "both" {
  return langs.secondary ? "both" : langs.primary;
}

/** A short piece of interface copy in the reader's main language. */
export function say(lang: QuizLang, copy: { en: string; de: string; ru: string }): string {
  return copy[lang];
}
