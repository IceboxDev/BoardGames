import type { QuiztopiaLanguage } from "@boardgames/core/protocol";
import { useCallback, useEffect, useState } from "react";
import { isPlainKey, isTypingTarget } from "../keys";
import { useQuiztopiaSettings } from "./useQuiztopiaSettings";

// The language a screen shows questions in: seeded from the trainer setting,
// overridable locally for the life of the screen (the toggle in a study
// session never rewrites the preference). `L` cycles it — the one shortcut
// shared by the study card, the article and the board.

export type ArticleLanguage = Exclude<QuiztopiaLanguage, "both">;

type Options<TBoth extends boolean> = {
  /** Offer "both" (question + translation). Article pages can't — a text is one language. */
  allowBoth?: TBoth;
  /** Register the `L` shortcut (default true). */
  keyboard?: boolean;
};

type LanguageOf<TBoth extends boolean> = TBoth extends true ? QuiztopiaLanguage : ArticleLanguage;

function coerce(lang: QuiztopiaLanguage, allowBoth: boolean): QuiztopiaLanguage {
  return !allowBoth && lang === "both" ? "en" : lang;
}

function cycle(lang: QuiztopiaLanguage, allowBoth: boolean): QuiztopiaLanguage {
  if (lang === "en") return "de";
  if (lang === "de") return allowBoth ? "both" : "en";
  return "en";
}

/** The single-text language a "both" preference falls back to. */
export function articleLanguage(lang: QuiztopiaLanguage): ArticleLanguage {
  return lang === "de" ? "de" : "en";
}

export function useQuestionLanguage<TBoth extends boolean = true>(options: Options<TBoth> = {}) {
  const allowBoth = options.allowBoth ?? true;
  const keyboard = options.keyboard ?? true;
  const { settings } = useQuiztopiaSettings();
  const [override, setOverride] = useState<QuiztopiaLanguage | null>(null);
  const language = coerce(override ?? settings.language, allowBoth) as LanguageOf<TBoth>;

  const setLanguage = useCallback((next: LanguageOf<TBoth>) => setOverride(next), []);
  const cycleLanguage = useCallback(
    () => setOverride((cur) => cycle(coerce(cur ?? settings.language, allowBoth), allowBoth)),
    [settings.language, allowBoth],
  );

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isPlainKey(e) || isTypingTarget(e.target)) return;
      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        cycleLanguage();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [keyboard, cycleLanguage]);

  return { language, setLanguage, cycleLanguage };
}
