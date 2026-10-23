import { createContext, useContext, useMemo } from "react";

// Every trainer / wiki URL in one place. The routes hang off `/trainer/quiz`
// (`QuizTrainer`), so a screen never spells a path by hand and a link from
// the study card into the archive is the same string the router matches.
// Dev previews render trainer screens elsewhere and swap the base through
// `TrainerBaseProvider`.

/** Where the trainer's routes are mounted (`QuizTrainer`). */
export const TRAINER_BASE = "/trainer/quiz";

const TrainerBaseContext = createContext<string>(TRAINER_BASE);
export const TrainerBaseProvider = TrainerBaseContext.Provider;

export interface StudyParams {
  /** Domain slug — that domain's due queue. */
  domain?: string;
  /** One article's facts (the wiki's "Study this article"). */
  article?: string;
  /** An explicit list (practise the table game's misses). */
  ids?: readonly string[];
  /** Cap the queue ("Quick 10"). */
  limit?: number;
}

export interface TrainerPaths {
  hub: string;
  study: (params?: StudyParams) => string;
  wiki: string;
  wikiDomain: (slug: string) => string;
  /** `factId` deep-links to that fact's passage via `#<factId>`. */
  wikiArticle: (articleId: string, factId?: string) => string;
  /** A fact's passage when only the fact is known (resolves to its article). */
  wikiFact: (factId: string) => string;
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
      if (params.article) sp.set("article", params.article);
      else if (params.ids && params.ids.length > 0) sp.set("ids", params.ids.join(","));
      else if (params.domain) sp.set("domain", params.domain);
      if (params.limit !== undefined) sp.set("limit", String(params.limit));
      const qs = sp.toString();
      return `${base}/study${qs ? `?${qs}` : ""}`;
    },
    wiki: `${base}/wiki`,
    wikiDomain: (slug) => `${base}/wiki/${slug}`,
    wikiArticle: (articleId, factId) =>
      `${base}/wiki/article/${articleId}${factId ? `#${factId}` : ""}`,
    wikiFact: (factId) => `${base}/wiki/fact/${factId}`,
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
