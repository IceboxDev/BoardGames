import { parseCardRef } from "@boardgames/core/games/quiztopia/ids";
import { useMemo } from "react";
import { articleSnippet, type Snippet } from "../../content";
import { useCardArticles } from "../../hooks/useContent";

// The article sentence around the revealed answer. Read from the card's
// article chunk through the shared content cache — only for real card refs
// (`c042`, `c042-v2`); a fixture ref has no chunk and simply yields nothing,
// as does a chunk that failed to load (the panel then shows just the answer).

export function useArticleSnippet(
  cardRef: string | null,
  categoryIndex: number | null,
  lang: "en" | "de",
  enabled: boolean,
): Snippet | null {
  const parsed = cardRef ? parseCardRef(cardRef) : null;
  const cardId = parsed?.cardId ?? null;
  const q = parsed?.q ?? 0;
  const articles = useCardArticles(cardId, enabled && categoryIndex != null);

  return useMemo(() => {
    if (!enabled || categoryIndex == null || !articles.data) return null;
    const set = articles.data.sets[categoryIndex];
    if (!set) return null;
    const span = set.answerSpans[lang][q];
    if (!span) return null;
    return articleSnippet(lang === "de" ? set.articleDe : set.articleEn, span, 140);
  }, [enabled, categoryIndex, articles.data, lang, q]);
}
