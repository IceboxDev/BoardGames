import type { QuizLang, QuizLanguages } from "@boardgames/core/protocol";
import { useCallback, useEffect, useState } from "react";
import { isScreenShortcut } from "../keys";
import { useQuizSettings } from "./useQuizSettings";

// The languages a screen shows questions in: seeded from the trainer setting
// (a main language and an optional second one), overridable locally for the
// life of the screen (the toggle in a study session never rewrites the
// preference). `L` cycles the main language EN → DE → RU — the one shortcut
// shared by the study card, the article and the board.

const ORDER: readonly QuizLang[] = ["en", "de", "ru"];

function cyclePrimary(langs: QuizLanguages): QuizLanguages {
  const primary = ORDER[(ORDER.indexOf(langs.primary) + 1) % ORDER.length];
  return { primary, secondary: langs.secondary === primary ? null : langs.secondary };
}

type Options = {
  /** Register the `L` shortcut (default true). */
  keyboard?: boolean;
};

export function useQuestionLanguage(options: Options = {}) {
  const keyboard = options.keyboard ?? true;
  const { settings } = useQuizSettings();
  const [override, setOverride] = useState<QuizLanguages | null>(null);
  const language: QuizLanguages = override ?? settings.language;

  const setLanguage = useCallback((next: QuizLanguages) => setOverride(next), []);
  const cycleLanguage = useCallback(
    () => setOverride((cur) => cyclePrimary(cur ?? settings.language)),
    [settings.language],
  );

  useEffect(() => {
    if (!keyboard) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isScreenShortcut(e)) return;
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

/** For one-text screens (an article, a list of titles): the main language only. */
export function usePrimaryLanguage(options: Options = {}) {
  const { language: langs, setLanguage } = useQuestionLanguage(options);
  const setPrimary = useCallback(
    (primary: QuizLang) =>
      setLanguage({ primary, secondary: langs.secondary === primary ? null : langs.secondary }),
    [setLanguage, langs.secondary],
  );
  return { language: langs.primary, setPrimary };
}
