// Quiz content ids. Opaque counters, never derived from text or position:
// an article `a0042`, a fact `f00123`, a wording `w00123`. Everything a
// member's progress hangs off is a fact id, so a fact keeps its id when it
// moves to another article (a split) or gains wordings from another game.
//
// The ids of the content converted from the first Quiztopia import are
// deterministic functions of the old positional ids (`c042-s07-q3`), so the
// database migration that carried progress across and the converter agree
// without a lookup table: card c, category n, question q →
//   article (c−1)·12 + n,  fact = wording (c−1)·60 + (n−1)·5 + q + 1.
// New content takes the next free number of its kind.

export const ARTICLE_ID_RE = /^a\d{4,}$/;
export const FACT_ID_RE = /^f\d{5,}$/;
export const WORDING_ID_RE = /^w\d{5,}$/;
/** A printed card of a source: `c042` (Quiztopia) or any source-chosen key. */
export const SOURCE_CARD_ID_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

/**
 * A tag: `facet:value`, lower case; a hierarchical value is a slash path
 * (`topic:music/opera`, `era:m2/c19`). The facets live in `content/tags.json`.
 */
export const TAG_RE = /^[a-z][a-z0-9-]*:[a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*$/;
/** A Wikidata item id. */
export const QID_RE = /^Q\d+$/;
/** A backlog item (`content/backlog.jsonl`). */
export const BACKLOG_ID_RE = /^b\d{5,}$/;
/** A source of an article's evidence ledger (`content/evidence/aNNNN.json`). */
export const EVIDENCE_SOURCE_ID_RE = /^s\d+$/;
/** An assessment of an article's evidence ledger. */
export const ASSESSMENT_ID_RE = /^e\d+$/;

export const MAX_FACTS_PER_ARTICLE = 8;

export function articleId(n: number): string {
  return `a${String(n).padStart(4, "0")}`;
}

export function factId(n: number): string {
  return `f${String(n).padStart(5, "0")}`;
}

export function wordingId(n: number): string {
  return `w${String(n).padStart(5, "0")}`;
}

/** The number inside an id (`f00123` → 123), or null for anything else. */
export function idNumber(id: string): number | null {
  const m = /^[afw](\d+)$/.exec(id);
  return m ? Number(m[1]) : null;
}

// ── The first Quiztopia import ───────────────────────────────────────────

const LEGACY_QUESTION_RE = /^c(\d{3})-s(0[1-9]|1[0-2])-q([0-4])$/;
const LEGACY_SET_RE = /^c(\d{3})-s(0[1-9]|1[0-2])$/;

export function legacyArticleNumber(card: number, n: number): number {
  return (card - 1) * 12 + n;
}

export function legacyFactNumber(card: number, n: number, q: number): number {
  return (card - 1) * 60 + (n - 1) * 5 + q + 1;
}

/** `c042-s07-q3` → its fact id; null for anything else. */
export function factIdFromLegacy(questionId: string): string | null {
  const m = LEGACY_QUESTION_RE.exec(questionId);
  if (!m) return null;
  return factId(legacyFactNumber(Number(m[1]), Number(m[2]), Number(m[3])));
}

/** `c042-s07` → its article id; null for anything else. */
export function articleIdFromLegacy(setId: string): string | null {
  const m = LEGACY_SET_RE.exec(setId);
  if (!m) return null;
  return articleId(legacyArticleNumber(Number(m[1]), Number(m[2])));
}
