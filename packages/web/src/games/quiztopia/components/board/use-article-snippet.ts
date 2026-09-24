import { parseCardRef } from "@boardgames/core/games/quiztopia/ids";
import { useEffect, useState } from "react";
import { articleSnippet, loadArticles, type Snippet } from "../../content";

// The article sentence around the revealed answer. Loaded lazily from the
// card's article chunk — only for real card refs (`c042`, `c042-v2`); a
// fixture ref has no chunk and simply yields nothing.

export function useArticleSnippet(
  cardRef: string | null,
  categoryIndex: number | null,
  lang: "en" | "de",
  enabled: boolean,
): Snippet | null {
  const [snippet, setSnippet] = useState<Snippet | null>(null);
  const parsed = cardRef ? parseCardRef(cardRef) : null;
  const cardId = parsed?.cardId ?? null;
  const q = parsed?.q ?? 0;

  useEffect(() => {
    setSnippet(null);
    if (!enabled || !cardId || categoryIndex == null) return;
    let cancelled = false;
    loadArticles(cardId)
      .then((card) => {
        if (cancelled) return;
        const set = card.sets[categoryIndex];
        if (!set) return;
        const article = lang === "de" ? set.articleDe : set.articleEn;
        const span = lang === "de" ? set.answerSpans.de[q] : set.answerSpans.en[q];
        if (!span) return;
        setSnippet(articleSnippet(article, span, 140));
      })
      .catch(() => {
        // No article for this ref (fixtures, missing chunk) — the panel just
        // shows the answer.
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, cardId, categoryIndex, lang, q]);

  return snippet;
}
