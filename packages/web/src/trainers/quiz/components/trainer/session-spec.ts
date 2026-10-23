import { ARTICLE_ID_RE, FACT_ID_RE } from "@boardgames/core/quiz/ids";
import { findDomain } from "../../domains";
import type { SessionSpec } from "../../hooks/useTrainerSession";

// `/study?…` → what to study. `article` wins over `ids` wins over `domain`
// (the same precedence `trainerPaths.study` writes); anything malformed
// falls back to "everything due".

export function specFromSearch(search: string): SessionSpec {
  const sp = new URLSearchParams(search);
  const limitRaw = sp.get("limit");
  const limitNum = limitRaw === null ? Number.NaN : Number.parseInt(limitRaw, 10);
  const limit = Number.isInteger(limitNum) && limitNum > 0 ? limitNum : undefined;
  const article = sp.get("article");
  if (article && ARTICLE_ID_RE.test(article)) return { kind: "article", articleId: article };
  const ids = sp.get("ids");
  if (ids) {
    const list = ids.split(",").filter((id) => FACT_ID_RE.test(id));
    if (list.length > 0) return { kind: "ids", ids: list };
  }
  const domain = findDomain(sp.get("domain"));
  return { kind: "due", domain: domain?.slug ?? null, limit };
}
