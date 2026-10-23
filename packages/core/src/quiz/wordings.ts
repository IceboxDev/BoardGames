// Which wording of a fact a member is shown: the one printed by their
// highest-ranked enabled source (`sources.ts` rank), else the fact's first
// wording. Shared by the server (journal, game decks) and the web (study
// card, wiki), so both always pick the same.

import type { Wording } from "./content-types.ts";
import { sourceById } from "./sources.ts";

function rank(source: string): number {
  return sourceById(source)?.rank ?? Number.MAX_SAFE_INTEGER;
}

export function leadWording(wordings: readonly Wording[], enabled: readonly string[]): Wording {
  let best: Wording | null = null;
  for (const w of wordings) {
    if (!w.printed || !enabled.includes(w.printed.source)) continue;
    if (!best?.printed || rank(w.printed.source) < rank(best.printed.source)) best = w;
  }
  return best ?? wordings[0];
}

/** The fact's printed wordings, best-ranked first — "asked in Quiztopia, Trivial Pursuit". */
export function printedSources(wordings: readonly Wording[]): string[] {
  const out = new Set<string>();
  for (const w of wordings) if (w.printed) out.add(w.printed.source);
  return [...out].sort((a, b) => rank(a) - rank(b));
}
