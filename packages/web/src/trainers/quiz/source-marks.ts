// Where a question's wording comes from, as a card shows it: one of the games
// whose printed cards are in the bank (`core/quiz/sources.ts`), or Homebrew — a
// question we wrote because no game prints it yet. Each has a short name and a
// square printer's stamp (assets/sources, DOMAIN-ICON-PROMPTS.md "Source
// marks"); a mark not generated yet leaves the short name alone.

import { QUIZ_SOURCES } from "@boardgames/core/quiz/sources";

export const HOMEBREW = "homebrew";

const MARKS = import.meta.glob<string>("./assets/sources/src-*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

const SHORT: Record<string, string> = {
  quiztopia: "Quiztopia",
  "trivial-pursuit": "Trivial Pursuit",
  "publish-or-perish": "P/P",
  "publish-or-perish-mge": "P/P MGE",
  [HOMEBREW]: "Homebrew",
};

export interface SourceMark {
  id: string;
  /** What the card prints beside the mark. */
  short: string;
  /** The full name, for a tooltip. */
  title: string;
  /** URL of the stamp; null until it is generated. */
  icon: string | null;
}

export function sourceMarkOf(id: string): SourceMark {
  const title =
    id === HOMEBREW
      ? "Homebrew — a question we wrote; no game prints it yet"
      : (QUIZ_SOURCES.find((s) => s.id === id)?.title ?? id);
  return {
    id,
    short: SHORT[id] ?? title,
    title,
    icon: MARKS[`./assets/sources/src-${id}.webp`] ?? null,
  };
}

/** Every source a card can name, in rank order, Homebrew last. */
export const SOURCE_MARK_IDS: readonly string[] = [...QUIZ_SOURCES.map((s) => s.id), HOMEBREW];
