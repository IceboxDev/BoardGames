import { createContext, useContext, useMemo } from "react";

// Every trainer / wiki URL in one place. The routes hang off the game shell's
// solo path (`/play/quiztopia/solo/*`), so a screen never spells a path by
// hand and a link from the study card into the archive is the same string
// the router matches. Dev previews render trainer screens outside the shell
// and swap the base through `TrainerBaseProvider`.

/** Where the trainer's routes are mounted (`TrainerRoutes`). */
export const TRAINER_BASE = "/play/quiztopia/solo";

const TrainerBaseContext = createContext<string>(TRAINER_BASE);
export const TrainerBaseProvider = TrainerBaseContext.Provider;

export interface StudyParams {
  /** District slug — that category's due queue. */
  category?: string;
  /** One set's five questions (the wiki's "Study this set"). */
  set?: string;
  /** An explicit list (practise the table game's misses). */
  ids?: readonly string[];
  /** Cap the queue ("Quick 10"). */
  limit?: number;
}

export interface TrainerPaths {
  hub: string;
  study: (params?: StudyParams) => string;
  wiki: string;
  wikiCategory: (slug: string) => string;
  /** `q` (0-based) deep-links to that question's passage via `#q<n>`. */
  wikiArticle: (slug: string, cardId: string, q?: number) => string;
  search: (q?: string) => string;
  /** The journal: every day's studied questions and read articles. */
  journal: string;
  /** The member's own content reports and their outcomes. */
  reports: string;
  /** The personal timeline; `q` focuses one pinned question. */
  timeline: (q?: string) => string;
}

export function trainerPaths(base: string): TrainerPaths {
  return {
    hub: base,
    study: (params = {}) => {
      const sp = new URLSearchParams();
      if (params.set) sp.set("set", params.set);
      else if (params.ids && params.ids.length > 0) sp.set("ids", params.ids.join(","));
      else if (params.category) sp.set("category", params.category);
      if (params.limit !== undefined) sp.set("limit", String(params.limit));
      const qs = sp.toString();
      return `${base}/study${qs ? `?${qs}` : ""}`;
    },
    wiki: `${base}/wiki`,
    wikiCategory: (slug) => `${base}/wiki/${slug}`,
    wikiArticle: (slug, cardId, q) =>
      `${base}/wiki/${slug}/${cardId}${q === undefined ? "" : `#q${q + 1}`}`,
    search: (q) => `${base}/wiki/search${q ? `?q=${encodeURIComponent(q)}` : ""}`,
    journal: `${base}/wiki/journal`,
    reports: `${base}/wiki/reports`,
    timeline: (q) => `${base}/timeline${q ? `?q=${encodeURIComponent(q)}` : ""}`,
  };
}

export function useTrainerPaths(): TrainerPaths {
  const base = useContext(TrainerBaseContext);
  return useMemo(() => trainerPaths(base), [base]);
}
