// Where the quiz bank's provenance lives on the web: the card archive
// (`packages/quiz-archive/…`: transcripts, run reports, photos' manifests),
// the history files and Wikidata. Pure, shared by the wiki's history panel
// and the admin Quiz desk.

const REPO_BLOB = "https://github.com/IceboxDev/BoardGames/blob/master/packages";
const REPO_TREE = "https://github.com/IceboxDev/BoardGames/tree/master/packages";

/**
 * A history entry's or backlog item's `ref` / link as a URL: an http(s) URL
 * as it is, a `quiz-archive/…` path as its file on GitHub; anything else
 * (a free-text pointer) has no link.
 */
export function archiveHref(ref: string): string | null {
  if (/^https?:\/\//.test(ref)) return ref;
  if (/^quiz-archive\/[^\s]+$/.test(ref)) return `${REPO_BLOB}/${ref}`;
  return null;
}

/** "quiz-archive/runs/tp-enrich/enrich-report/a2469.md" → "runs/…/a2469.md" (short, for a chip). */
export function archiveLabel(ref: string): string {
  const path = ref.replace(/^quiz-archive\//, "");
  const parts = path.split("/");
  return parts.length > 3 ? `${parts[0]}/…/${parts[parts.length - 1]}` : path;
}

/** A history ref (`a0042#17`, `cards/quiztopia#3`) → its history file on GitHub. */
export function historyRefHref(ref: string): string | null {
  const m = /^(a\d{4,}|cards\/[a-z0-9-]+)#[1-9]\d*$/.exec(ref);
  if (!m) return null;
  return `${REPO_BLOB}/core/src/quiz/content/history/${m[1]}.json`;
}

/** A run's folder in the archive. */
export function runHref(runId: string): string {
  return `${REPO_TREE}/quiz-archive/runs/${runId}`;
}

export function wikidataHref(qid: string): string {
  return `https://www.wikidata.org/wiki/${qid}`;
}
