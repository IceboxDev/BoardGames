import { z } from "zod";
import { WORDS_DE } from "./de";
import { WORDS_EN } from "./en";

/** The word sets a game can be dealt from. */
export const LANGUAGES = ["en", "de"] as const;
export const LanguageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof LanguageSchema>;

export const LANGUAGE_LABELS: Record<Language, string> = { en: "English", de: "Deutsch" };

export const WORD_SETS: Record<Language, readonly string[]> = { en: WORDS_EN, de: WORDS_DE };
