// `quiz-ingest regroup --simulate`: a proposed domain / sub-category layout
// from tag queries, without touching an article. Rules are tried in order and
// each active article goes to the first rule whose query its tags answer
// (`tagMatches`, over its stored and derived index tags); an article no rule
// matches stays where it is.

import { domainShape, indexTags } from "../../../packages/core/src/quiz/build.ts";
import type { Article, DomainSlug } from "../../../packages/core/src/quiz/content-types.ts";
import { isActiveArticle } from "../../../packages/core/src/quiz/content-types.ts";
import { tagMatches } from "../../../packages/core/src/quiz/tags.ts";
import { domainBySlug, subOf } from "../../../packages/core/src/quiz/taxonomy.ts";
import type { ReasonsFile } from "./history-io.ts";

export interface TagQuery {
  /** Every one of these must match a tag of the article. */
  all?: string[];
  /** At least one of these must match (when given). */
  any?: string[];
  /** None of these may match. */
  none?: string[];
}

export interface RegroupRule {
  domain: string;
  /** The sub-category; omitted = keep the article's sub when the domain has it. */
  sub?: string;
  query: TagQuery;
}

export function parseRegroupRules(raw: unknown): RegroupRule[] {
  const list = Array.isArray(raw) ? raw : (raw as { rules?: unknown })?.rules;
  if (!Array.isArray(list) || list.length === 0)
    throw new Error("rules: expected a non-empty list (or {rules: [...]})");
  return list.map((r, i) => {
    const rule = r as RegroupRule;
    if (!rule || typeof rule.domain !== "string" || !domainBySlug(rule.domain))
      throw new Error(`rule ${i + 1}: unknown domain ${rule?.domain}`);
    if (rule.sub !== undefined && !subOf(rule.domain, rule.sub))
      throw new Error(`rule ${i + 1}: unknown sub ${rule.domain}/${rule.sub}`);
    const q = rule.query ?? {};
    for (const k of ["all", "any", "none"] as const) {
      const v = q[k];
      if (v !== undefined && (!Array.isArray(v) || !v.every((t) => typeof t === "string")))
        throw new Error(`rule ${i + 1}: query.${k} must be a list of tags`);
    }
    return { domain: rule.domain, ...(rule.sub ? { sub: rule.sub } : {}), query: q };
  });
}

export function queryMatches(tags: readonly string[], q: TagQuery): boolean {
  const hit = (query: string) => tags.some((t) => tagMatches(t, query));
  if (q.all && !q.all.every(hit)) return false;
  if (q.any?.length && !q.any.some(hit)) return false;
  if (q.none?.some(hit)) return false;
  return true;
}

export interface RegroupMove {
  article: string;
  from: string;
  to: string;
  rule: number;
}

export interface RegroupResult {
  moves: RegroupMove[];
  /** Active articles no rule matched (they stay). */
  unmatched: string[];
  /** Matched articles whose rule names no sub the article's sub fits (sent to the domain's first sub). */
  subGuessed: string[];
  /** The articles as they would be after the moves. */
  proposed: Article[];
  before: ReturnType<typeof domainShape>;
  after: ReturnType<typeof domainShape>;
}

export function simulateRegroup(
  articles: readonly Article[],
  rules: readonly RegroupRule[],
): RegroupResult {
  const moves: RegroupMove[] = [];
  const unmatched: string[] = [];
  const subGuessed: string[] = [];
  const proposed = articles.map((a) => {
    if (!isActiveArticle(a)) return a;
    const tags = indexTags(a);
    const i = rules.findIndex((r) => queryMatches(tags, r.query));
    if (i < 0) {
      unmatched.push(a.id);
      return a;
    }
    const r = rules[i];
    let sub = r.sub;
    if (!sub) {
      if (subOf(r.domain, a.sub)) sub = a.sub;
      else {
        sub = domainBySlug(r.domain)?.subs[0]?.slug ?? a.sub;
        subGuessed.push(a.id);
      }
    }
    if (r.domain === a.domain && sub === a.sub) return a;
    moves.push({
      article: a.id,
      from: `${a.domain}/${a.sub}`,
      to: `${r.domain}/${sub}`,
      rule: i + 1,
    });
    return { ...a, domain: r.domain as DomainSlug, sub };
  });
  return {
    moves,
    unmatched,
    subGuessed,
    proposed,
    before: domainShape(articles),
    after: domainShape(proposed),
  };
}

/** A reasons file for `quiz-ingest log` once the moves are made. */
export function regroupReasons(
  moves: readonly RegroupMove[],
  rules: readonly RegroupRule[],
  rulesFile: string,
): ReasonsFile {
  const out: ReasonsFile = {};
  for (const m of moves) {
    const q = rules[m.rule - 1].query;
    const desc = [
      q.all?.length ? `all of ${q.all.join(", ")}` : "",
      q.any?.length ? `any of ${q.any.join(", ")}` : "",
      q.none?.length ? `none of ${q.none.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("; ");
    out[m.article] = {
      kind: "recategorised",
      reason: `Regrouped from ${m.from} to ${m.to} by rule ${m.rule} of ${rulesFile} (${desc || "catch-all"}).`,
      fields: ["domain", "sub"],
    };
  }
  return out;
}
