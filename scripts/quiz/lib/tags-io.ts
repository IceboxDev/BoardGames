// Tags on disk and the pure edit behind `quiz-ingest tag add|rm` (core
// `quiz/tags.ts`; the registry is `content/tags.json`).

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Article } from "../../../packages/core/src/quiz/content-types.ts";
import {
  type TagRegistry,
  TagRegistrySchema,
  tagProblems,
} from "../../../packages/core/src/quiz/tags.ts";
import { CONTENT_DIR } from "./content-io.ts";

export function readTagRegistry(contentDir = CONTENT_DIR): TagRegistry {
  return TagRegistrySchema.parse(JSON.parse(readFileSync(join(contentDir, "tags.json"), "utf8")));
}

/**
 * The article with `tags` added to or removed from the article itself or one
 * of its facts (retired included). Throws on an unknown target, on a tag
 * that wouldn't change anything, or on a tag problem the edit introduces.
 */
export function editTags(
  article: Article,
  targetId: string,
  op: "add" | "rm",
  tags: readonly string[],
  registry: TagRegistry,
): Article {
  if (tags.length === 0) throw new Error("no tags given");
  const next: Article = structuredClone(article);
  const holder: { tags?: string[] } | undefined =
    targetId === next.id
      ? next
      : [...next.facts, ...(next.retired ?? [])].find((f) => f.id === targetId);
  if (!holder) throw new Error(`${targetId} is not in ${article.id}`);
  const cur = holder.tags ?? [];
  let out: string[];
  if (op === "add") {
    const dup = tags.filter((t) => cur.includes(t));
    if (dup.length > 0) throw new Error(`${targetId} already has ${dup.join(", ")}`);
    out = [...cur, ...new Set(tags)];
  } else {
    const missing = tags.filter((t) => !cur.includes(t));
    if (missing.length > 0) throw new Error(`${targetId} has no ${missing.join(", ")}`);
    out = cur.filter((t) => !tags.includes(t));
  }
  if (out.length > 0) holder.tags = out;
  else delete holder.tags;
  const before = new Set(tagProblems(article, registry));
  const added = tagProblems(next, registry).filter((p) => !before.has(p));
  if (added.length > 0) throw new Error(added.join("; "));
  return next;
}
