// Tags: a second, many-to-many way to slice the quiz bank beside the fixed
// domain / sub-category. A tag is `facet:value` (`topic:music/opera`,
// `region:de`, `risk:superlative`); the facets, their labels and their
// allowed values live in the registry `content/tags.json`.
//
// Tags come from two places:
//   - stored on an article or fact (`tags`), written by people and agents;
//   - derived from the content (`derivedTags`) — the era of the timeline
//     event, the games that print it, a time-sensitive phrasing, the
//     question's form, the answer's shape. Derived tags are computed into
//     `index.json` by `build.ts` and never stored; a facet whose `mode` is
//     "derived" can't be stored at all, one in "both" mode takes both.
//
// Browser-safe (no node imports): the web labels tags with the registry.

import { z } from "zod";
import type { Article, Fact, RetiredFact } from "./content-types.ts";
import { TAG_RE } from "./ids.ts";
import { SOURCE_IDS } from "./sources.ts";
import { parseTimelineDate } from "./timeline.ts";

// ── Registry (`content/tags.json`) ───────────────────────────────────────

const FACET_ID_RE = /^[a-z][a-z0-9-]*$/;
const SEGMENT_RE = /^[a-z0-9][a-z0-9-]*$/;

export const TagLabelsSchema = z.object({
  en: z.string().min(1),
  de: z.string().min(1),
  ru: z.string().min(1),
});

export const TagValueSchema = z.object({
  /** The value after the colon; a slash path in a hierarchical facet. */
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/),
  en: z.string().min(1),
  de: z.string().min(1),
  ru: z.string().min(1),
});
export type TagValue = z.infer<typeof TagValueSchema>;

/**
 * Values a facet accepts beyond its listed ones: an ISO 3166-1 alpha-2
 * country code in lower case, any slash path of slugs, or any one slug.
 */
export const TAG_OPEN_KINDS = ["iso-3166-1", "path", "slug"] as const;
export const TAG_FACET_MODES = ["stored", "derived", "both"] as const;

export const TagFacetSchema = z.object({
  id: z.string().regex(FACET_ID_RE),
  labels: TagLabelsSchema,
  /** What the facet is for, for the people and agents who tag. */
  description: z.string().min(1).optional(),
  /** stored (default): only written by hand; derived: only computed; both. */
  mode: z.enum(TAG_FACET_MODES).optional(),
  /** Values are slash paths, and a query matches a value's ancestors (`tagMatches`). */
  hierarchical: z.boolean().optional(),
  /** At most one value per article or fact; a stored value overrides a derived one. */
  single: z.boolean().optional(),
  open: z.enum(TAG_OPEN_KINDS).optional(),
  values: z.array(TagValueSchema).optional(),
});
export type TagFacet = z.infer<typeof TagFacetSchema>;

export const TagRegistrySchema = z
  .object({
    version: z.literal(1),
    facets: z.array(TagFacetSchema).min(1),
  })
  .superRefine((r, ctx) => {
    const ids = new Set<string>();
    r.facets.forEach((f, i) => {
      if (ids.has(f.id))
        ctx.addIssue({ code: "custom", path: ["facets", i, "id"], message: "duplicate facet" });
      ids.add(f.id);
      const values = new Set<string>();
      (f.values ?? []).forEach((v, j) => {
        if (values.has(v.id))
          ctx.addIssue({
            code: "custom",
            path: ["facets", i, "values", j, "id"],
            message: "duplicate value",
          });
        values.add(v.id);
        if (!f.hierarchical && v.id.includes("/"))
          ctx.addIssue({
            code: "custom",
            path: ["facets", i, "values", j, "id"],
            message: "a path in a flat facet",
          });
      });
      if (!f.open && !f.values?.length && f.mode !== "derived")
        ctx.addIssue({
          code: "custom",
          path: ["facets", i],
          message: "a stored facet needs values or `open`",
        });
    });
  });
export type TagRegistry = z.infer<typeof TagRegistrySchema>;

// ── Tags ─────────────────────────────────────────────────────────────────

export interface ParsedTag {
  facet: string;
  value: string;
  /** The value's path segments (one for a flat value). */
  path: string[];
}

export function parseTag(tag: string): ParsedTag | null {
  if (!TAG_RE.test(tag)) return null;
  const i = tag.indexOf(":");
  const value = tag.slice(i + 1);
  return { facet: tag.slice(0, i), value, path: value.split("/") };
}

export function facetById(registry: TagRegistry, id: string): TagFacet | undefined {
  return registry.facets.find((f) => f.id === id);
}

/** ISO 3166-1 alpha-2, lower case (the officially assigned codes). */
export const ISO_3166_ALPHA2: ReadonlySet<string> = new Set(
  (
    "ad ae af ag ai al am ao aq ar as at au aw ax az ba bb bd be bf bg bh bi bj bl bm bn bo bq br " +
    "bs bt bv bw by bz ca cc cd cf cg ch ci ck cl cm cn co cr cu cv cw cx cy cz de dj dk dm do dz " +
    "ec ee eg eh er es et fi fj fk fm fo fr ga gb gd ge gf gg gh gi gl gm gn gp gq gr gs gt gu gw " +
    "gy hk hm hn hr ht hu id ie il im in io iq ir is it je jm jo jp ke kg kh ki km kn kp kr kw ky " +
    "kz la lb lc li lk lr ls lt lu lv ly ma mc md me mf mg mh mk ml mm mn mo mp mq mr ms mt mu mv " +
    "mw mx my mz na nc ne nf ng ni nl no np nr nu nz om pa pe pf pg ph pk pl pm pn pr ps pt pw py " +
    "qa re ro rs ru rw sa sb sc sd se sg sh si sj sk sl sm sn so sr ss st sv sx sy sz tc td tf tg " +
    "th tj tk tl tm tn to tr tt tv tw tz ua ug um us uy uz va vc ve vg vi vn vu wf ws ye yt za zm zw"
  ).split(" "),
);

/** Whether a facet accepts a value (listed, or allowed by `open`). */
export function facetAccepts(facet: TagFacet, value: string): boolean {
  const path = value.split("/");
  if (!facet.hierarchical && path.length > 1) return false;
  if (!path.every((s) => SEGMENT_RE.test(s))) return false;
  if (facet.values?.some((v) => v.id === value)) return true;
  switch (facet.open) {
    case "iso-3166-1":
      return ISO_3166_ALPHA2.has(value);
    case "path":
      return true;
    case "slug":
      return path.length === 1;
    default:
      return false;
  }
}

/**
 * Whether `tag` answers `query`: the same tag, any tag of the facet for
 * `facet` / `facet:`, or — in a hierarchical facet — a descendant of the
 * queried path (`era:m2` matches `era:m2/c19`).
 */
export function tagMatches(tag: string, query: string): boolean {
  if (tag === query) return true;
  const facet = query.endsWith(":") ? query.slice(0, -1) : query;
  if (!query.includes(":") || query.endsWith(":")) return tag.startsWith(`${facet}:`);
  return tag.startsWith(`${query}/`);
}

/** A tag's label in a language: a listed value's, a country's name, else the raw value. */
export function tagLabel(registry: TagRegistry, tag: string, lang: "en" | "de" | "ru"): string {
  const parsed = parseTag(tag);
  if (!parsed) return tag;
  const facet = facetById(registry, parsed.facet);
  const listed = facet?.values?.find((v) => v.id === parsed.value);
  if (listed) return listed[lang];
  if (facet?.open === "iso-3166-1" && ISO_3166_ALPHA2.has(parsed.value)) {
    try {
      return (
        new Intl.DisplayNames([lang], { type: "region" }).of(parsed.value.toUpperCase()) ??
        parsed.value
      );
    } catch {
      return parsed.value;
    }
  }
  return parsed.value;
}

/**
 * Every problem with an article's stored tags (its own and every fact's,
 * retired included): malformed, an unknown facet, a derived-only facet
 * stored, a value the facet doesn't accept, two values of a single facet.
 */
export function tagProblems(article: Article, registry: TagRegistry): string[] {
  const problems: string[] = [];
  const check = (id: string, tags: readonly string[] | undefined) => {
    const perFacet = new Map<string, number>();
    for (const tag of tags ?? []) {
      const parsed = parseTag(tag);
      if (!parsed) {
        problems.push(`${id}: malformed tag "${tag}"`);
        continue;
      }
      const facet = facetById(registry, parsed.facet);
      if (!facet) {
        problems.push(`${id}: unknown tag facet "${parsed.facet}" (${tag})`);
        continue;
      }
      if (facet.mode === "derived") {
        problems.push(`${id}: ${tag} is derived, never stored`);
        continue;
      }
      if (!facetAccepts(facet, parsed.value)) problems.push(`${id}: unknown tag value ${tag}`);
      perFacet.set(facet.id, (perFacet.get(facet.id) ?? 0) + 1);
      if (facet.single && perFacet.get(facet.id) === 2)
        problems.push(`${id}: more than one ${facet.id}: tag`);
    }
  };
  check(article.id, article.tags);
  for (const f of [...article.facts, ...(article.retired ?? [])]) check(f.id, f.tags);
  return problems;
}

// ── Derived tags ─────────────────────────────────────────────────────────

/** Facets `derivedTags` writes. */
export const DERIVED_FACETS = ["era", "source", "printed", "risk", "form", "answer"] as const;

/** Before this year (BC) an event is deep time, not a millennium. */
const DEEP_TIME_BEFORE = -10000;

/**
 * `era:` of a timeline date, by the popular count (the 1900s are the 20th
 * century, 2000 opens the 21st and the 3rd millennium): `era:m2/c19`;
 * BC `era:m1-bc/c5-bc`; before 10,000 BC `era:deep-time`.
 */
export function eraTag(start: string): string | null {
  const d = parseTimelineDate(start);
  if (!d) return null;
  if (d.year < DEEP_TIME_BEFORE) return "era:deep-time";
  if (d.year > 0) {
    return `era:m${Math.floor(d.year / 1000) + 1}/c${Math.floor(d.year / 100) + 1}`;
  }
  const bc = -d.year;
  return `era:m${Math.ceil(bc / 1000)}-bc/c${Math.ceil(bc / 100)}-bc`;
}

const TIME_SENSITIVE_RE = [
  /\bas of\b/i,
  // "the current record holder", "currently" — not "voltage, current and resistance".
  /\bcurrently\b|\b(?:the|its|his|her|their|our|whose)\s+current\b/i,
  /\bto date\b/i,
  /\b(?:aktuell|derzeit|derzeitige?[mnrs]?|zurzeit|gegenwärtig|bis heute)\b/i,
  /(?:^|[^\p{L}])(?:сейчас|в настоящее время|на сегодняшний день|до сих пор)(?:[^\p{L}]|$)/iu,
];
/** "current" that is a flow, not a time. */
const CURRENT_FLOW_RE =
  /\b(?:electric(?:al)?|alternating|direct|ocean|eddy|rip|tidal|jet)\s+current/i;

/** Whether a text asks about a state that can change ("current", "as of", "bis heute"). */
export function timeSensitiveText(text: string): boolean {
  const scrubbed = text.replace(CURRENT_FLOW_RE, " ");
  return TIME_SENSITIVE_RE.some((re) => re.test(scrubbed));
}

export const QUESTION_FORMS = [
  "how-many",
  "when",
  "where",
  "definition",
  "who",
  "what",
  "which-not",
] as const;
export type QuestionForm = (typeof QUESTION_FORMS)[number];

const FORM_PATTERNS: Record<"en" | "de", [Exclude<QuestionForm, "which-not">, RegExp][]> = {
  en: [
    ["how-many", /\bhow (?:many|much|long|tall|high|old|far|big|large|deep|wide|heavy|often)\b/],
    ["when", /\bwhen\b|\b(?:what|which) (?:year|century|decade|month|day|date)\b/],
    [
      "where",
      /\bwhere\b|\b(?:what|which) (?:country|city|town|state|region|continent|island|place|river|mountain)\b/,
    ],
    [
      "definition",
      /^\W*what (?:is|are|was|were) (?:a|an)\b(?!.*\b(?:called|known as|termed|named)\b)|\bwhat does .+ mean\b|\bwhat is meant by\b/,
    ],
    ["who", /\bwho(?:m|se)?\b/],
    ["what", /\b(?:what|which|name)\b/],
  ],
  de: [
    ["how-many", /\bwie (?:viele?|lange?|hoch|alt|weit|groß|schwer|tief|breit|oft)(?![\p{L}])/u],
    ["when", /\bwann\b|\bwelche[mnrs]? (?:jahr|jahrhundert|jahrzehnt|monat|tag|datum)\b/],
    [
      "where",
      /\bwo(?:her|hin)?\b|\bwelche[mnrs]? (?:land|stadt|staat|region|kontinent|insel|ort|fluss|berg)\b/,
    ],
    [
      "definition",
      /^\W*was (?:ist|sind|war|waren) (?:ein|eine|einen)\b(?!.*\b(?:genannt|bezeichnet|nennt)\b)|\bwas versteht man unter\b|\bwas bedeutet\b/,
    ],
    ["who", /\bwe(?:r|n|m|ssen)\b/],
    ["what", /\b(?:was|welche[mnrs]?|wie hei(?:ß|ss)t|wie hie(?:ß|ss)|wie nennt)(?![\p{L}])/u],
  ],
};
// The exception question ("Which planet is not a gas giant?"): a "which" and
// a "not" in one clause — no comma, "and" or relative pronoun between them,
// and not a relative "under which".
const WHICH_NOT_RE = {
  en: /(?<!(?:,|\b(?:in|under|on|at|by|for|from|with|of|to|through|after|before|during))\s)\bwhich\b(?:(?!\b(?:who|whom|whose|that|which|and|but|because|since|although|while|when|if|by)\b)[^,;:?])*?(?:\bnot\b(?!\s+only)|n't\b)/,
  de: /(?<!(?:,|\b(?:in|unter|an|auf|bei|für|von|mit|aus|zu|nach|vor|durch))\s)\bwelche[mnrs]?\b(?:(?!\b(?:der|die|das|dem|den|deren|dessen|und|aber|weil|da|obwohl|während|wenn|als)\b)[^,;:?])*?(?:\bnicht\b(?!\s+nur)|\bkein(?:e|er|en|em|es)?\b)/,
};

/**
 * The form a question asks in: the earliest interrogative it uses (ties go
 * to the more specific form), "which … not" overriding; null when none is
 * found. A heuristic over English and German phrasings.
 */
export function questionForm(question: string, lang: "en" | "de"): QuestionForm | null {
  const q = question.toLowerCase();
  if (WHICH_NOT_RE[lang].test(q)) return "which-not";
  let best: QuestionForm | null = null;
  let at = Number.POSITIVE_INFINITY;
  for (const [form, re] of FORM_PATTERNS[lang]) {
    const m = re.exec(q);
    if (m && m.index < at) {
      best = form;
      at = m.index;
    }
  }
  return best;
}

const MONTHS =
  "january|february|march|april|may|june|july|august|september|october|november|december|" +
  "januar|jänner|februar|märz|mai|juni|juli|oktober|dezember";
const DAY_MONTH_YEAR_RE = new RegExp(
  `^(?:\\d{1,2}\\.?\\s+)?(?:${MONTHS})\\s+(?:\\d{1,2},?\\s+)?\\d{1,4}(?:\\s*(?:bc|bce|ad|ce))?$`,
  "i",
);
const YEAR_RE =
  /^(?:(?:c\.|ca\.|circa|um|in|im jahr(?:e)?)\s*)?(\d{1,4})(?:\s*(bc|bce|ad|ce|v\.\s?chr\.|n\.\s?chr\.))?$/i;
// A number with an optional unit; a unit starts lower case or with a symbol,
// so a title ("99 Luftballons", "7 Wonders") is not a number. Use on English.
const NUMBER_RE =
  /^(?:(?:about|approx\.?|approximately|around|ca\.?|circa|over|more than|under|less than|roughly|almost|nearly)\s+)?[-−]?\d[\d.,'   ]*(?:\s?(?:%|‰|[\p{Ll}°²³/$€£][\p{L}°²³/.]{0,11}(?:\s\p{Ll}{1,12}){0,2}))?$/u;
const ASKS_YEAR_RE = /\byear\b|\bjahr/i;

/**
 * `answer:date` / `answer:number` from the answer's shape, or null: a date
 * written out, an ISO date, or a bare year when the question asks for a year
 * or the fact's timeline starts in it; a number with an optional unit.
 */
export function answerShape(
  answer: string,
  timelineStart: string | null = null,
  question = "",
): "date" | "number" | null {
  const a = answer.trim();
  if (DAY_MONTH_YEAR_RE.test(a) || /^-?\d{1,4}-\d{2}(?:-\d{2})?$/.test(a)) return "date";
  const year = YEAR_RE.exec(a);
  if (year) {
    if (ASKS_YEAR_RE.test(question)) return "date";
    const d = timelineStart ? parseTimelineDate(timelineStart) : null;
    if (d && Math.abs(d.year) === Number(year[1])) return "date";
  }
  return NUMBER_RE.test(a) ? "number" : null;
}

function factTags(f: Fact | RetiredFact, perFact: boolean): string[] {
  const out = new Set<string>();
  const era = eraTag(f.timeline.start);
  if (era) out.add(era);
  let printed = false;
  for (const w of f.wordings) {
    if (w.printed) {
      printed = true;
      if ((SOURCE_IDS as readonly string[]).includes(w.printed.source))
        out.add(`source:${w.printed.source}`);
    }
  }
  out.add(printed ? "printed:yes" : "printed:no");
  const texts = [
    ...f.wordings.flatMap((w) => [w.en, w.de, w.ru ?? ""]),
    f.answerEn,
    f.answerDe,
    f.answerRu ?? "",
  ];
  if (f.reviewBy || texts.some(timeSensitiveText)) out.add("risk:time-sensitive");
  if (perFact) {
    const w = f.wordings[0];
    const form = questionForm(w.en, "en") ?? questionForm(w.de, "de");
    if (form) out.add(`form:${form}`);
    const shape = answerShape(f.answerEn, f.timeline.start, `${w.en} ${w.de}`);
    if (shape) out.add(`answer:${shape}`);
  }
  return [...out];
}

/**
 * The tags the content implies, sorted. With a fact: that fact's era,
 * printing sources, `printed:yes|no`, `risk:time-sensitive` (a phrasing, or a
 * `reviewBy` date), `form:` and `answer:`. Without: the article's — the
 * union over its active facts of era, sources and time-sensitivity, and
 * `printed:yes` when any fact is printed (form and answer are per question).
 */
export function derivedTags(article: Article, fact?: Fact | RetiredFact): string[] {
  if (fact) return factTags(fact, true).sort();
  const out = new Set<string>();
  for (const f of article.facts) for (const t of factTags(f, false)) out.add(t);
  if (out.has("printed:yes")) out.delete("printed:no");
  return [...out].sort();
}

/**
 * Stored ∪ derived, sorted. With a registry, a stored value of a `single`
 * facet replaces the derived one (a hand-set `form:who` beats the guess).
 */
export function mergeTags(
  stored: readonly string[],
  derived: readonly string[],
  registry?: TagRegistry,
): string[] {
  const storedFacets = new Set(stored.map((t) => parseTag(t)?.facet));
  const keep = derived.filter((t) => {
    const facet = parseTag(t)?.facet;
    if (!registry || !facet || !storedFacets.has(facet)) return true;
    return !facetById(registry, facet)?.single;
  });
  return [...new Set([...stored, ...keep])].sort();
}
