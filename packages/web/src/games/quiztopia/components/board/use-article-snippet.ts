import { useMemo } from "react";
import { articleSnippet, findFact, type Snippet } from "../../../../trainers/quiz/content";
import { useArticle, useQuizIndex } from "../../../../trainers/quiz/hooks/useContent";

// The article sentence around the revealed answer, read from the fact's
// article chunk through the shared content cache. A fixture question (not a
// quiz fact) has no article and simply yields nothing, as does a chunk that
// failed to load (the panel then shows just the answer).

export function useArticleSnippet(
  questionId: string | null,
  lang: "en" | "de",
  enabled: boolean,
): Snippet | null {
  const index = useQuizIndex(enabled && questionId !== null);
  const articleId = questionId ? (index.data?.articleOf(questionId)?.id ?? null) : null;
  const article = useArticle(articleId, enabled);

  return useMemo(() => {
    if (!enabled || !questionId || !article.data) return null;
    const found = findFact(article.data, questionId);
    if (!found) return null;
    const body = lang === "de" ? article.data.bodyDe : article.data.bodyEn;
    return articleSnippet(body, found.fact.spans[lang], 140);
  }, [enabled, questionId, article.data, lang]);
}
