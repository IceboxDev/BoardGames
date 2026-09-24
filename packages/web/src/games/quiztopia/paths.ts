import { useMemo } from "react";
import { useGameShell } from "../../hooks/useGameShell";

// Every trainer / wiki URL in one place. The routes hang off the game shell's
// solo path (`/play/<slug>/solo/*`), so a screen never spells a path by hand
// and a link from the study card into the archive is the same string the
// router matches.

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
    timeline: (q) => `${base}/timeline${q ? `?q=${encodeURIComponent(q)}` : ""}`,
  };
}

export function useTrainerPaths(): TrainerPaths {
  const { def } = useGameShell();
  const base = `/play/${def.slug}/solo`;
  return useMemo(() => trainerPaths(base), [base]);
}
