import { parseQuestionId, parseSetId } from "@boardgames/core/games/quiztopia/ids";
import { districtBySlug } from "../../bands";
import type { SessionSpec } from "../../hooks/useTrainerSession";

// `/study?…` → what to study. `set` wins over `ids` wins over `category`
// (the same precedence `trainerPaths.study` writes); anything malformed
// falls back to "everything due".

export function specFromSearch(search: string): SessionSpec {
  const sp = new URLSearchParams(search);
  const limitRaw = sp.get("limit");
  const limitNum = limitRaw === null ? Number.NaN : Number.parseInt(limitRaw, 10);
  const limit = Number.isInteger(limitNum) && limitNum > 0 ? limitNum : undefined;
  const set = sp.get("set");
  if (set && parseSetId(set)) return { kind: "set", setId: set };
  const ids = sp.get("ids");
  if (ids) {
    const list = ids.split(",").filter((id) => parseQuestionId(id) !== null);
    if (list.length > 0) return { kind: "ids", ids: list };
  }
  const category = sp.get("category");
  const district = category ? districtBySlug(category) : undefined;
  return { kind: "due", category: district?.n ?? null, limit };
}
